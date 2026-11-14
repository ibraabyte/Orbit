import { describe, expect, it } from "vitest";
import { t } from "@/lib/i18n";
import {
  CALL_VOICES,
  callClock,
  callConsentKey,
  functionCalls,
  initialView,
  isCallVoice,
  MAX_CAPTIONS,
  nextRefs,
  reduceEvent,
  responseEvent,
  savedNoteEvent,
  toolOutputEvent,
  type CallView
} from "@/lib/voice-call";

const live: CallView = { ...initialView, phase: "listening" };
type Event = Parameters<typeof reduceEvent>[1];
const run = (view: CallView, ...events: Event[]) => events.reduce<CallView>((current, event) => reduceEvent(current, event), view);

describe("the voice call", () => {
  it("shows what each side says, in the order it was said", () => {
    const view = run(
      live,
      { type: "conversation.item.added", item: { id: "u1", type: "message", role: "user" } },
      { type: "conversation.item.added", item: { id: "a1", type: "message", role: "assistant" } },
      // The assistant starts talking before the user's words are fully written out.
      { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "جهزت " },
      { type: "response.output_audio_transcript.delta", item_id: "a1", delta: "لك المهمة" },
      { type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: " ذكرني بكرة أشتري حليب " }
    );
    expect(view.captions).toEqual([
      { id: "u1", role: "user", text: "ذكرني بكرة أشتري حليب" },
      { id: "a1", role: "assistant", text: "جهزت لك المهمة" }
    ]);
  });

  it("reads the older event names too, and keeps the final words", () => {
    const view = run(
      live,
      { type: "response.audio_transcript.delta", item_id: "a1", delta: "Hel" },
      { type: "response.audio_transcript.done", item_id: "a1", transcript: "Hello, what do you need?" }
    );
    expect(view.captions).toEqual([{ id: "a1", role: "assistant", text: "Hello, what do you need?" }]);
  });

  it("follows who is talking", () => {
    expect(run(live, { type: "output_audio_buffer.started" }).phase).toBe("speaking");
    // The user talks over the assistant: it stops and listens.
    expect(run(live, { type: "output_audio_buffer.started" }, { type: "input_audio_buffer.speech_started" }).phase).toBe("listening");
    expect(run(live, { type: "input_audio_buffer.speech_stopped" }).phase).toBe("thinking");
    expect(run(live, { type: "output_audio_buffer.started" }, { type: "output_audio_buffer.stopped" }).phase).toBe("listening");
  });

  it("ignores events it doesn't know, and everything after the call ended", () => {
    expect(reduceEvent(live, { type: "rate_limits.updated" })).toBe(live);
    const ended: CallView = { ...live, phase: "ended" };
    expect(reduceEvent(ended, { type: "output_audio_buffer.started" })).toBe(ended);
  });

  it("keeps an error's message", () => {
    expect(reduceEvent(live, { type: "error", error: { message: "Session expired" } }).error).toBe("Session expired");
  });

  it("keeps only the last captions", () => {
    const many = Array.from({ length: MAX_CAPTIONS + 5 }, (_, i) => ({ type: "conversation.item.input_audio_transcription.completed", item_id: `u${i}`, transcript: `${i}` }));
    const view = run(live, ...many);
    expect(view.captions).toHaveLength(MAX_CAPTIONS);
    expect(view.captions.at(-1)?.text).toBe(String(MAX_CAPTIONS + 4));
  });

  it("finds the tool calls in a finished response", () => {
    const event = {
      type: "response.done",
      response: {
        output: [
          { type: "message", id: "a1" },
          { type: "function_call", call_id: "c1", name: "propose_create", arguments: '{"kind":"task","fields":{"title":"حليب"}}' },
          { type: "function_call", call_id: "c2", name: "find_items" },
          { type: "function_call", name: "no_id" }
        ]
      }
    };
    expect(functionCalls(event)).toEqual([
      { callId: "c1", name: "propose_create", arguments: '{"kind":"task","fields":{"title":"حليب"}}' },
      { callId: "c2", name: "find_items", arguments: "" }
    ]);
    expect(functionCalls({ type: "response.created" })).toEqual([]);
    expect(functionCalls({ type: "response.done", response: {} })).toEqual([]);
  });

  it("answers a tool call and tells the model what was saved", () => {
    expect(toolOutputEvent("c1", '{"ok":true}')).toEqual({ type: "conversation.item.create", item: { type: "function_call_output", call_id: "c1", output: '{"ok":true}' } });
    expect(responseEvent()).toEqual({ type: "response.create" });
    expect(responseEvent("Say hi")).toEqual({ type: "response.create", response: { instructions: "Say hi" } });
    const note = savedNoteEvent(["اشتري حليب"]);
    expect(note.item.role).toBe("system");
    expect(note.item.content[0].text).toContain('["اشتري حليب"]');
  });

  it("sends back the server's refs, or keeps the ones it has", () => {
    const refs = { "task-1": { kind: "task", id: "x", label: "a" } };
    expect(nextRefs(refs, undefined)).toBe(refs);
    expect(nextRefs(refs, {})).toEqual({});
  });

  it("counts the call's time and knows its voices", () => {
    expect(callClock(0)).toBe("0:00");
    expect(callClock(245.7)).toBe("4:05");
    expect(callClock(900)).toBe("15:00");
    expect(isCallVoice("marin")).toBe(true);
    expect(isCallVoice("nope")).toBe(false);
    expect(CALL_VOICES[0]).toBe("marin");
    expect(callConsentKey("u1")).toBe("orbit.call.consent.u1");
  });

  it("has every call text in the app's language", () => {
    for (const key of ["callTitle", "callConsentBody", "callCost", "callNoKey", "callNeedsBuild"] as const) expect(t[key]).toBeTruthy();
    expect(t.callCost).toContain("{n}");
  });
});
