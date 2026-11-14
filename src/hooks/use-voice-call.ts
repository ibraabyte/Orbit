import { useCallback, useEffect, useRef, useState } from "react";
import { NativeModules, Platform } from "react-native";
import type { ProposedAction } from "@/lib/assistant";
import { getApi } from "@/lib/backend";
import {
  CALL_URL,
  elevenMessage,
  elevenMode,
  functionCalls,
  greeting,
  initialView,
  MAX_CALL_SECONDS,
  nextRefs,
  reduceEvent,
  responseEvent,
  savedNoteEvent,
  savedNoteText,
  toolFailedOutput,
  toolOutputEvent,
  type CallRef,
  type CallView,
  type CallVoice,
  type FunctionCall,
  type SessionReply,
  type ToolReply
} from "@/lib/voice-call";

// LiveKit's build of WebRTC: the same API as react-native-webrtc, and the one ElevenLabs' SDK runs on, so both ways of
// calling share one WebRTC in the app.
type WebRtc = typeof import("@livekit/react-native-webrtc");
type ElevenClient = typeof import("@elevenlabs/client");
type ElevenConversation = Awaited<ReturnType<ElevenClient["Conversation"]["startSession"]>>;
type LiveKit = typeof import("@livekit/react-native");
type InCall = typeof import("react-native-incall-manager").default;

// Loaded once, lazily: an installed build from before this feature has neither native module, and the assistant must
// still open there (the call button then says a new build is needed).
function load<T>(get: () => T): T | null {
  try {
    return get();
  } catch {
    return null;
  }
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webrtc = load(() => require("@livekit/react-native-webrtc") as WebRtc);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inCall = load(() => (require("react-native-incall-manager") as { default: InCall }).default);
export const voiceCallAvailable = Boolean(webrtc?.RTCPeerConnection && webrtc.mediaDevices);
// ElevenLabs runs on LiveKit, whose native part came with the same build.
export const elevenLabsAvailable = voiceCallAvailable && Boolean(NativeModules.LivekitReactNativeModule);

// Loaded only when an ElevenLabs call starts: loading it sets up LiveKit's WebRTC globals and audio for the call.
let eleven: { client: ElevenClient; livekit: LiveKit } | null = null;
function loadEleven() {
  if (eleven || !elevenLabsAvailable) return eleven;
  eleven = load(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@elevenlabs/react-native");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { client: require("@elevenlabs/client") as ElevenClient, livekit: require("@livekit/react-native") as LiveKit };
  });
  return eleven;
}

type Peer = InstanceType<WebRtc["RTCPeerConnection"]>;
type Channel = ReturnType<Peer["createDataChannel"]>;
type Stream = Awaited<ReturnType<WebRtc["mediaDevices"]["getUserMedia"]>>;

export type CallError = "start" | "mic" | "lost" | "noKey" | "update" | "elevenKey" | string;

const micDenied = (error: unknown) => error instanceof Error && /permission|denied|not ?allowed/i.test(`${error.name} ${error.message}`);

// A live voice call with the assistant. Audio goes straight between the phone and OpenAI or ElevenLabs (WebRTC, with the
// phone's own echo cancellation, so the user can talk over the assistant); the server only makes what the call needs and
// answers its tool calls. Proposed changes are handed to onActions; nothing is saved here.
export function useVoiceCall(options: { onActions: (actions: ProposedAction[]) => void; arabic: boolean }) {
  const [view, setView] = useState<CallView>(initialView);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const peer = useRef<Peer | null>(null);
  const channel = useRef<Channel | null>(null);
  const stream = useRef<Stream | null>(null);
  const refs = useRef<Record<string, CallRef>>({});
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const conversation = useRef<ElevenConversation | null>(null);
  const live = useRef(false);
  const onActions = useRef(options.onActions);
  onActions.current = options.onActions;
  const arabic = options.arabic;

  const send = (event: object) => {
    if (channel.current?.readyState === "open") channel.current.send(JSON.stringify(event));
  };

  const hangUp = useCallback((error: CallError | null = null) => {
    live.current = false;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    try {
      channel.current?.close();
    } catch {}
    try {
      stream.current?.getTracks().forEach((track) => track.stop());
    } catch {}
    try {
      peer.current?.close();
    } catch {}
    const ending = conversation.current;
    conversation.current = null;
    if (ending) void ending.endSession().catch(() => undefined);
    channel.current = null;
    stream.current = null;
    peer.current = null;
    try {
      inCall?.setKeepScreenOn(false);
      inCall?.stop();
    } catch {}
    setView((current) => ({ ...current, phase: "ended", error: error ?? current.error }));
  }, []);

  useEffect(() => () => hangUp(), [hangUp]);

  // One tool call, answered by the Orbit server. Its answer goes back to the model.
  const runTool = async (name: string, args: string) => {
    try {
      const reply = await getApi().post<ToolReply>("/assistant/call/tool", { name, arguments: args, refs: refs.current });
      refs.current = nextRefs(refs.current, reply.refs);
      if (reply.actions.length) onActions.current(reply.actions);
      return reply.output;
    } catch {
      return toolFailedOutput();
    }
  };

  // OpenAI: once every call in the response is answered, the model goes on.
  const runTools = async (calls: FunctionCall[]) => {
    for (const call of calls) {
      const output = await runTool(call.name, call.arguments);
      if (!live.current) return;
      send(toolOutputEvent(call.callId, output));
    }
    send(responseEvent());
  };

  const startClock = () => {
    const began = Date.now();
    timer.current = setInterval(() => {
      const now = (Date.now() - began) / 1000;
      setSeconds(now);
      if (now >= MAX_CALL_SECONDS) hangUp(null);
    }, 1000);
  };

  // ElevenLabs: its SDK runs the call over LiveKit; the tools are answered by name, the same way.
  const startEleven = async (session: SessionReply) => {
    const sdk = loadEleven();
    if (!sdk || !session.conversation_token) return hangUp("start");
    const tools = Object.fromEntries(
      (session.tools ?? []).map((name) => [name, async (parameters: unknown) => (live.current ? runTool(name, JSON.stringify(parameters ?? {})) : toolFailedOutput())])
    );
    try {
      const started = await sdk.client.Conversation.startSession({
        conversationToken: session.conversation_token,
        connectionType: "webrtc",
        overrides: (session.overrides ?? undefined) as never,
        clientTools: tools,
        onConnect: () => setView((current) => ({ ...current, phase: "listening" })),
        onModeChange: ({ mode }) => setView((current) => elevenMode(current, mode)),
        onMessage: ({ message, role, event_id }) => setView((current) => elevenMessage(current, `${role}-${event_id}`, role, message)),
        onError: (message) => setView((current) => ({ ...current, error: message || "start" })),
        onDisconnect: (details) => {
          if (live.current) hangUp(details.reason === "error" ? "lost" : null);
        }
      });
      if (!live.current) return void started.endSession().catch(() => undefined);
      conversation.current = started;
      setSpeaker(true);
      startClock();
    } catch (error) {
      hangUp(micDenied(error) ? "mic" : "start");
    }
  };

  const onEvent = (raw: unknown) => {
    let event: { type?: string; [key: string]: unknown };
    try {
      event = JSON.parse(String(raw));
    } catch {
      return;
    }
    setView((current) => reduceEvent(current, event));
    const calls = functionCalls(event);
    if (calls.length) void runTools(calls);
  };

  const start = useCallback(
    async (voice: CallVoice | null) => {
      if (!webrtc || live.current) return;
      live.current = true;
      refs.current = {};
      setSeconds(0);
      setMuted(false);
      setView({ phase: "connecting", captions: [], error: null });
      let session: SessionReply;
      try {
        const providers = elevenLabsAvailable ? ["openai", "elevenlabs"] : ["openai"];
        session = await getApi().post<SessionReply>("/assistant/call/session", { locale: arabic ? "ar" : "en", voice: voice || null, providers });
      } catch (error) {
        live.current = false;
        const status = (error as { status?: number })?.status;
        const message = error instanceof Error ? error.message : "";
        // A 409 is a missing key, or ElevenLabs refusing it: that message says what to fix.
        const code = status === 409 ? (/ElevenLabs refused/i.test(message) ? "elevenKey" : /update the app/i.test(message) ? "update" : "noKey") : message || "start";
        setView({ phase: "idle", captions: [], error: code });
        return;
      }
      refs.current = session.refs;
      if (session.provider === "elevenlabs") return startEleven(session);
      try {
        const media = await webrtc.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!live.current) return media.getTracks().forEach((track) => track.stop());
        stream.current = media;
        const pc = new webrtc.RTCPeerConnection();
        peer.current = pc;
        media.getTracks().forEach((track) => pc.addTrack(track, media));
        const dc = pc.createDataChannel("oai-events");
        channel.current = dc;
        dc.addEventListener("message", (message: { data?: unknown }) => onEvent(message.data));
        dc.addEventListener("open", () => {
          setView((current) => ({ ...current, phase: "listening" }));
          send(responseEvent(greeting(arabic)));
        });
        pc.addEventListener("connectionstatechange", () => {
          if (live.current && (pc.connectionState === "failed" || pc.connectionState === "disconnected")) hangUp("lost");
        });
        const offer = await pc.createOffer({});
        await pc.setLocalDescription(offer);
        const answer = await fetch(`${CALL_URL}?model=${encodeURIComponent(session.model)}`, {
          method: "POST",
          body: offer.sdp,
          headers: { Authorization: `Bearer ${session.client_secret}`, "Content-Type": "application/sdp" }
        });
        if (!answer.ok) throw new Error("start");
        await pc.setRemoteDescription({ type: "answer", sdp: await answer.text() });
        if (!live.current) return;
        try {
          inCall?.start({ media: "audio" });
          inCall?.setForceSpeakerphoneOn(true);
          inCall?.setKeepScreenOn(true);
        } catch {}
        setSpeaker(true);
        startClock();
      } catch (error) {
        hangUp(micDenied(error) ? "mic" : "start");
      }
    },
    [arabic, hangUp]
  );

  const toggleMute = () => {
    const next = !muted;
    stream.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    conversation.current?.setMicMuted(next);
    setMuted(next);
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    try {
      if (conversation.current) {
        const output = Platform.OS === "ios" ? (next ? "force_speaker" : "default") : next ? "speaker" : "earpiece";
        void eleven?.livekit.AudioSession.selectAudioOutput(output).catch(() => undefined);
      } else inCall?.setForceSpeakerphoneOn(next);
    } catch {}
    setSpeaker(next);
  };

  // Tells the model what the user just saved, so it doesn't offer it again.
  const noteSaved = (labels: string[]) => {
    if (!labels.length) return;
    if (conversation.current) conversation.current.sendContextualUpdate(savedNoteText(labels));
    else send(savedNoteEvent(labels));
  };

  const reset = () => setView(initialView);

  return { view, muted, speaker, seconds, start, hangUp: () => hangUp(null), toggleMute, toggleSpeaker, noteSaved, reset };
}
