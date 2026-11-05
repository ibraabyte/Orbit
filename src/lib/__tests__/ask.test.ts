import { describe, expect, it } from "vitest";
import { askBody, askGate, briefStep, exchanges, ASK_HISTORY_TURNS, ASK_QUESTION_MAX, ASK_TURN_MAX, activeProvider, cleanQuestion, consentKey, consentNames, consentWith, historyFor, parseConsent, serverDetail, withdrawKeys, type ChatItem } from "@/lib/ask";
import { briefCacheKey } from "@/lib/morning-brief";
import type { IntegrationsOverview } from "@/lib/integrations";

const overview = (overrides: Partial<IntegrationsOverview> = {}): IntegrationsOverview => ({
  whoop: { configured: false, connected: false, last_synced_at: null, last_sync_error: null },
  seerr: { connected: false, url: null, account_name: null, connected_at: null },
  ai: { configured: false, connected: false, provider: null, model: null, instructions: null, connected_at: null },
  chatgpt: { status: "not_connected" },
  ...overrides
});
const own = (provider: "anthropic" | "openai" | "gemini" | "openrouter") => ({ configured: true, connected: true, provider, model: "m", instructions: null, connected_at: null });

describe("the AI that gets the data", () => {
  it("names the one the server will use: ChatGPT first, then the user's own key, then the server key", () => {
    expect(activeProvider(overview())).toBeNull();
    expect(activeProvider(overview({ ai: own("openai") }))).toBe("OpenAI");
    expect(activeProvider(overview({ ai: own("gemini"), chatgpt: { status: "connected" } }))).toBe("ChatGPT");
    expect(activeProvider(overview({ ai: { ...own("anthropic"), connected: false, provider: null } }))).toBe("Claude");
    // An expired or half-finished ChatGPT sign-in is not an AI.
    expect(activeProvider(overview({ chatgpt: { status: "expired" } }))).toBeNull();
    expect(activeProvider(overview({ chatgpt: { status: "pending" } }))).toBeNull();
  });
});

describe("consent", () => {
  it("is kept per person, in a key that signing out does not clear", () => {
    expect(consentKey("u1")).not.toBe(consentKey("u2"));
    expect(consentKey("u1").startsWith("orbit.cache.")).toBe(false);
  });

  it("reads only a well-formed acceptance and treats anything else as not accepted", () => {
    expect(parseConsent(JSON.stringify({ provider: "Claude" }))).toBe("Claude");
    for (const raw of [null, "", "nope", "null", "[]", "{}", '{"provider":""}', '{"provider":3}', '{"accepted":true}']) {
      expect(parseConsent(raw), String(raw)).toBeNull();
    }
  });
});

describe("what the screen shows", () => {
  it("waits for what it has not read yet, and sends nothing before then", () => {
    expect(askGate(undefined, "Claude")).toBe("loading");
    expect(askGate("Claude", undefined)).toBe("loading");
  });

  it("offers Integrations when no AI is connected, whatever was accepted before", () => {
    expect(askGate(null, null)).toBe("no-ai");
    expect(askGate(null, "Claude")).toBe("no-ai");
  });

  it("asks first, and asks again when the data would go to a different AI", () => {
    expect(askGate("Claude", null)).toBe("consent");
    expect(askGate("OpenAI", "Claude")).toBe("consent");
    expect(askGate("Claude", "Claude")).toBe("ready");
  });
});

describe("the question", () => {
  it("is trimmed, and refused when empty or too long", () => {
    expect(cleanQuestion("  how much did I spend?  ")).toBe("how much did I spend?");
    expect(cleanQuestion("   ")).toBeNull();
    expect(cleanQuestion("x".repeat(ASK_QUESTION_MAX))).toHaveLength(ASK_QUESTION_MAX);
    expect(cleanQuestion("x".repeat(ASK_QUESTION_MAX + 1))).toBeNull();
  });
});

const chat = (...turns: [ChatItem["role"], string, string?][]): ChatItem[] => turns.map(([role, content, failed], index) => ({ id: index + 1, role, content, failed }));

describe("history sent with a question", () => {
  it("is the turns before it, oldest first, without failed questions", () => {
    const items = chat(["user", "q1"], ["assistant", "a1"], ["user", "lost", "Server error"], ["user", "q2"]);
    expect(historyFor(items, 4)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" }
    ]);
    // Retrying the failed one sends what came before it.
    expect(historyFor(items, 3)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" }
    ]);
    expect(historyFor(items, 1)).toEqual([]);
  });

  it("keeps only the latest turns and cuts each to the server's limit", () => {
    const many = chat(...Array.from({ length: 30 }, (_, n): [ChatItem["role"], string] => [n % 2 ? "assistant" : "user", `turn ${n}`]), ["user", "last"]);
    const history = historyFor(many, 31);
    expect(history).toHaveLength(ASK_HISTORY_TURNS);
    expect(history[0].content).toBe("turn 20");
    expect(history.at(-1)?.content).toBe("turn 29");
    const long = chat(["assistant", "y".repeat(ASK_TURN_MAX + 500)], ["user", "next"]);
    expect(historyFor(long, 2)[0].content).toHaveLength(ASK_TURN_MAX);
  });

  it("ignores an id that is not in the chat rather than sending everything", () => {
    expect(historyFor(chat(["user", "q1"], ["assistant", "a1"]), 99)).toEqual([]);
  });

  it("is the body the server expects", () => {
    expect(askBody("hello", [{ role: "user", content: "hi" }], "ar")).toEqual({ question: "hello", history: [{ role: "user", content: "hi" }], locale: "ar" });
  });
});

describe("the chat list", () => {
  it("pairs each question with its answer, newest first, and leaves unanswered ones open", () => {
    const items = chat(["user", "q1"], ["assistant", "a1"], ["user", "q2", "Server error"], ["user", "q3"]);
    expect(exchanges(items).map(({ question, answer }) => [question.content, answer?.content ?? null])).toEqual([
      ["q3", null],
      ["q2", null],
      ["q1", "a1"]
    ]);
    expect(exchanges([])).toEqual([]);
  });

  it("puts a retried answer under its own question, whatever was asked since", () => {
    // q1 failed, q2 was answered, then q1 was retried: its answer is stored right after it.
    const items: ChatItem[] = [
      { id: 1, role: "user", content: "q1" },
      { id: 4, role: "assistant", content: "a1" },
      { id: 2, role: "user", content: "q2" },
      { id: 3, role: "assistant", content: "a2" }
    ];
    expect(exchanges(items).map(({ question, answer }) => [question.content, answer?.content])).toEqual([
      ["q2", "a2"],
      ["q1", "a1"]
    ]);
    // An answer with no question before it is dropped, not shown as a question.
    expect(exchanges([{ id: 1, role: "assistant", content: "stray" }])).toEqual([]);
  });
});

describe("the morning brief follows the same consent", () => {
  it("makes no AI call without an acceptance, whatever is connected", () => {
    expect(briefStep(null, "Claude")).toBe("consent");
    expect(briefStep(null, null)).toBe("consent");
  });

  it("asks again when the acceptance was for a different AI, and offers Integrations when none is connected", () => {
    expect(briefStep("Claude", "OpenAI")).toBe("consent");
    expect(briefStep("Claude", null)).toBe("no-ai");
  });

  it("asks the server only for the AI that was accepted", () => {
    expect(briefStep("Claude", "Claude")).toBe("ask");
  });

  it("is withdrawn together with the saved AI brief, so a cached text is not shown afterwards", () => {
    expect(withdrawKeys("u1")).toEqual([consentKey("u1"), briefCacheKey("u1")]);
    expect(withdrawKeys("u1")).not.toEqual(withdrawKeys("u2"));
  });
});

describe("serverDetail", () => {
  it("adds the server's English message only to English text", () => {
    expect(serverDetail(new Error("Claude is busy right now."), false)).toBe("Claude is busy right now.");
    expect(serverDetail(new Error("Claude is busy right now."), true)).toBe("");
    expect(serverDetail("odd", false)).toBe("");
  });
});

describe("more than one AI", () => {
  const ais = {
    choices: [
      { provider: "openai" as const, model: "m", instructions: null, connected_at: null, is_default: false },
      { provider: "gemini" as const, model: "m", instructions: null, connected_at: null, is_default: true }
    ],
    default: "gemini" as const,
    server_key: false
  };

  it("names the default, or the one picked for this request while it is still connected", () => {
    expect(activeProvider(overview({ ais }))).toBe("Gemini");
    expect(activeProvider(overview({ ais }), "openai")).toBe("OpenAI");
    expect(activeProvider(overview({ ais }), "chatgpt")).toBe("Gemini");
  });

  it("keeps an agreement per AI, and agreeing to one more keeps the others", () => {
    const first = consentWith(null, "OpenAI");
    expect(JSON.parse(first)).toEqual({ provider: "OpenAI", providers: ["OpenAI"] });
    const both = parseConsent(consentWith(parseConsent(first), "Gemini"));
    expect(consentNames(both)).toEqual(["OpenAI", "Gemini"]);
    expect(askGate("Gemini", both)).toBe("ready");
    expect(askGate("OpenAI", both)).toBe("ready");
    expect(askGate("ChatGPT", both)).toBe("consent");
    // Agreeing again doesn't repeat a name.
    expect(consentNames(parseConsent(consentWith(both, "OpenAI")))).toEqual(["Gemini", "OpenAI"]);
    // The old one-AI form is still read.
    expect(consentNames(parseConsent(JSON.stringify({ provider: "Claude" })))).toEqual(["Claude"]);
  });
});
