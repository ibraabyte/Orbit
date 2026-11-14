import { useCallback, useEffect, useRef, useState } from "react";
import type { ProposedAction } from "@/lib/assistant";
import { getApi } from "@/lib/backend";
import {
  CALL_URL,
  functionCalls,
  greeting,
  initialView,
  MAX_CALL_SECONDS,
  nextRefs,
  reduceEvent,
  responseEvent,
  savedNoteEvent,
  toolFailedOutput,
  toolOutputEvent,
  type CallRef,
  type CallView,
  type CallVoice,
  type FunctionCall,
  type SessionReply,
  type ToolReply
} from "@/lib/voice-call";

type WebRtc = typeof import("react-native-webrtc");
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
const webrtc = load(() => require("react-native-webrtc") as WebRtc);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const inCall = load(() => (require("react-native-incall-manager") as { default: InCall }).default);
export const voiceCallAvailable = Boolean(webrtc?.RTCPeerConnection && webrtc.mediaDevices);

type Peer = InstanceType<WebRtc["RTCPeerConnection"]>;
type Channel = ReturnType<Peer["createDataChannel"]>;
type Stream = Awaited<ReturnType<WebRtc["mediaDevices"]["getUserMedia"]>>;

export type CallError = "start" | "mic" | "lost" | "noKey" | string;

// A live voice call with the assistant. Audio goes straight between the phone and OpenAI (WebRTC, with the phone's own
// echo cancellation, so the user can talk over the assistant); the server only makes the call's secret and answers its
// tool calls. Proposed changes are handed to onActions; nothing is saved here.
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

  // Each tool call goes through the Orbit server; once every call in the response is answered, the model goes on.
  const runTools = async (calls: FunctionCall[]) => {
    for (const call of calls) {
      let output = toolFailedOutput();
      try {
        const reply = await getApi().post<ToolReply>("/assistant/call/tool", { name: call.name, arguments: call.arguments, refs: refs.current });
        refs.current = nextRefs(refs.current, reply.refs);
        output = reply.output;
        if (reply.actions.length) onActions.current(reply.actions);
      } catch {}
      if (!live.current) return;
      send(toolOutputEvent(call.callId, output));
    }
    send(responseEvent());
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
    async (voice: CallVoice) => {
      if (!webrtc || live.current) return;
      live.current = true;
      refs.current = {};
      setSeconds(0);
      setMuted(false);
      setView({ phase: "connecting", captions: [], error: null });
      let session: SessionReply;
      try {
        session = await getApi().post<SessionReply>("/assistant/call/session", { locale: arabic ? "ar" : "en", voice });
      } catch (error) {
        live.current = false;
        const status = (error as { status?: number })?.status;
        setView({ phase: "idle", captions: [], error: status === 409 ? "noKey" : error instanceof Error && error.message ? error.message : "start" });
        return;
      }
      refs.current = session.refs;
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
        const began = Date.now();
        timer.current = setInterval(() => {
          const now = (Date.now() - began) / 1000;
          setSeconds(now);
          if (now >= MAX_CALL_SECONDS) hangUp(null);
        }, 1000);
      } catch (error) {
        const denied = error instanceof Error && /permission|denied|not ?allowed/i.test(`${error.name} ${error.message}`);
        hangUp(denied ? "mic" : "start");
      }
    },
    [arabic, hangUp]
  );

  const toggleMute = () => {
    const next = !muted;
    stream.current?.getAudioTracks().forEach((track) => {
      track.enabled = !next;
    });
    setMuted(next);
  };

  const toggleSpeaker = () => {
    const next = !speaker;
    try {
      inCall?.setForceSpeakerphoneOn(next);
    } catch {}
    setSpeaker(next);
  };

  // Tells the model what the user just saved, so it doesn't offer it again.
  const noteSaved = (labels: string[]) => {
    if (labels.length) send(savedNoteEvent(labels));
  };

  const reset = () => setView(initialView);

  return { view, muted, speaker, seconds, start, hangUp: () => hangUp(null), toggleMute, toggleSpeaker, noteSaved, reset };
}
