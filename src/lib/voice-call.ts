import type { ProposedAction } from "@/lib/assistant";

// The voice call with the assistant (src/app/call.tsx, src/hooks/use-voice-call.ts). The Orbit server makes a short
// secret for one call with the user's own OpenAI key (POST /assistant/call/session); the phone talks to OpenAI Realtime
// over WebRTC with it, and the tool calls the model makes go back to the server (POST /assistant/call/tool), which
// answers them with the text assistant's own tools. Changes come back as proposals; only a tap saves one.
// Shapes mirror backend/app/routers/call.py. This file is the part with no native code, so it can be tested.

export const CALL_VOICES = ["marin", "cedar", "ash", "coral", "sage", "verse"] as const;
export type CallVoice = (typeof CALL_VOICES)[number];
export const CALL_URL = "https://api.openai.com/v1/realtime/calls";
// A call ends by itself after this long, so a forgotten one doesn't keep spending the user's credit.
export const MAX_CALL_SECONDS = 15 * 60;
// Captions kept on screen.
export const MAX_CAPTIONS = 24;

export type CallRef = { kind: string; id: string; label: string };
export type CallStatus = { available: boolean; source: "voice" | "ai" | null; voices: string[] };
export type SessionReply = { client_secret: string; expires_at: number | null; model: string; refs: Record<string, CallRef> };
export type ToolReply = { output: string; actions: ProposedAction[]; refs: Record<string, CallRef> };

export type CallPhase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended";
export type Caption = { id: string; role: "user" | "assistant"; text: string };
export type FunctionCall = { callId: string; name: string; arguments: string };
export type CallView = { phase: CallPhase; captions: Caption[]; error: string | null };

export const initialView: CallView = { phase: "idle", captions: [], error: null };

// Agreeing to send the voice to OpenAI is kept on this phone, per account.
export const callConsentKey = (userId: string) => `orbit.call.consent.${userId}`;
export const callVoiceKey = "orbit.call.voice";
export const isCallVoice = (value: unknown): value is CallVoice => typeof value === "string" && (CALL_VOICES as readonly string[]).includes(value);

type Event = { type?: string; [key: string]: unknown };

const text = (value: unknown) => (typeof value === "string" ? value : "");

// A caption for an item, made when the item first shows up so captions stay in the order they were said.
function withCaption(captions: Caption[], id: string, role: Caption["role"], update: (current: string) => string): Caption[] {
  const at = captions.findIndex((caption) => caption.id === id);
  if (at === -1) return [...captions, { id, role, text: update("") }].slice(-MAX_CAPTIONS);
  return captions.map((caption, index) => (index === at ? { ...caption, text: update(caption.text) } : caption));
}

// What one event from OpenAI changes on the call screen. Events it doesn't know leave the view as it is.
// Both the current names (response.output_audio_transcript.*) and the older beta ones (response.audio_transcript.*) are read.
export function reduceEvent(view: CallView, event: Event): CallView {
  if (view.phase === "ended") return view;
  switch (event.type) {
    case "conversation.item.added":
    case "conversation.item.created": {
      const item = (event.item ?? {}) as { id?: string; type?: string; role?: string };
      if (item.type !== "message" || !item.id || (item.role !== "user" && item.role !== "assistant")) return view;
      return { ...view, captions: withCaption(view.captions, item.id, item.role, (current) => current) };
    }
    case "input_audio_buffer.speech_started":
      return { ...view, phase: "listening" };
    case "input_audio_buffer.speech_stopped":
    case "response.created":
      return { ...view, phase: "thinking" };
    case "output_audio_buffer.started":
      return { ...view, phase: "speaking" };
    case "output_audio_buffer.stopped":
    case "output_audio_buffer.cleared":
      return { ...view, phase: "listening" };
    case "conversation.item.input_audio_transcription.delta":
      return { ...view, captions: withCaption(view.captions, text(event.item_id), "user", (current) => current + text(event.delta)) };
    case "conversation.item.input_audio_transcription.completed":
      return { ...view, captions: withCaption(view.captions, text(event.item_id), "user", () => text(event.transcript).trim()) };
    case "response.output_audio_transcript.delta":
    case "response.audio_transcript.delta":
      return { ...view, captions: withCaption(view.captions, text(event.item_id), "assistant", (current) => current + text(event.delta)) };
    case "response.output_audio_transcript.done":
    case "response.audio_transcript.done":
      return { ...view, captions: withCaption(view.captions, text(event.item_id), "assistant", (current) => text(event.transcript) || current) };
    case "error": {
      const error = (event.error ?? {}) as { message?: string };
      return { ...view, error: text(error.message) || "error" };
    }
    default:
      return view;
  }
}

// The tool calls in a finished response: the phone runs each through the server, then asks for the next response.
export function functionCalls(event: Event): FunctionCall[] {
  if (event.type !== "response.done") return [];
  const output = ((event.response ?? {}) as { output?: unknown[] }).output;
  if (!Array.isArray(output)) return [];
  return output.flatMap((item) => {
    const call = item as { type?: string; call_id?: string; name?: string; arguments?: string };
    if (call.type !== "function_call" || !call.call_id || !call.name) return [];
    return [{ callId: call.call_id, name: call.name, arguments: typeof call.arguments === "string" ? call.arguments : "" }];
  });
}

// Messages the phone sends to OpenAI over the data channel.
export const toolOutputEvent = (callId: string, output: string) => ({
  type: "conversation.item.create",
  item: { type: "function_call_output", call_id: callId, output }
});

export const responseEvent = (instructions?: string) => (instructions ? { type: "response.create", response: { instructions } } : { type: "response.create" });

export const greeting = (arabic: boolean) =>
  arabic
    ? "Greet the user in a few words of everyday Saudi Arabic and ask what they need."
    : "Greet the user in a few words and ask what they need.";

// After the user taps Save, the model is told, so it doesn't offer the same change again.
export const savedNoteEvent = (labels: string[]) => ({
  type: "conversation.item.create",
  item: {
    type: "message",
    role: "system",
    content: [{ type: "input_text", text: `The user tapped Save on the screen. Saved now: ${JSON.stringify(labels)}.` }]
  }
});

export const toolFailedOutput = () => JSON.stringify({ error: "Orbit couldn't run that just now. Tell the user and try again once." });

// The refs the next tool call sends: the server answers with every ref still valid, plus any it just added.
export const nextRefs = (current: Record<string, CallRef>, next: Record<string, CallRef> | undefined) => next ?? current;

// 0:00, 4:05, 12:30.
export function callClock(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
