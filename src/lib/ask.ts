import { aiChoicesOf, aiName, type AiChoiceName, type IntegrationsOverview } from "@/lib/integrations";
import { briefCacheKey } from "@/lib/morning-brief";

// Ask Orbit: questions answered by the user's own AI from their data. The server builds the data and sends it;
// the phone keeps the chat in memory only and remembers one thing: that this person agreed to that. The same agreement
// covers the written morning brief, which sends the day's titles, amounts, sleep and recovery to the same AI.
// The limits mirror backend/app/routers/assistant.py.

export const ASK_QUESTION_MAX = 500;
export const ASK_HISTORY_TURNS = 10;
export const ASK_TURN_MAX = 1500;

export type AskTurn = { role: "user" | "assistant"; content: string };
// failed: the text shown for the error that stopped a question from being answered.
export type ChatItem = AskTurn & { id: number; failed?: string };

// The AI the server will use: the picked one if still connected, else the default (backend/app/services/whoop_ai.py
// `access_for`). A server key is Claude's. null when there is none.
export function activeProvider(overview: IntegrationsOverview, picked: AiChoiceName | null = null): string | null {
  return aiName(aiChoicesOf(overview), picked);
}

// Not under "orbit.cache.", so signing out keeps it, and per person, so another account on this phone is asked again.
export const consentKey = (userId: string) => `orbit.ask.consent.${userId}`;

// The AIs the person agreed to share with, as one text ("Claude, OpenAI"), or null for anything that is not a clear
// acceptance. Agreeing for one more AI adds it to the list (consentWith).
const CONSENT_SEPARATOR = ", ";

export function parseConsent(raw: string | null): string | null {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return null;
    const { provider, providers } = value as { provider?: unknown; providers?: unknown };
    if (Array.isArray(providers)) {
      const names = providers.filter((name): name is string => typeof name === "string" && name.length > 0);
      return names.length ? names.join(CONSENT_SEPARATOR) : null;
    }
    return typeof provider === "string" && provider ? provider : null;
  } catch {
    return null;
  }
}

export const consentNames = (accepted: string | null) => (accepted ? accepted.split(CONSENT_SEPARATOR) : []);

// What to save when the person agrees for `provider` too. `provider` stays for older app versions, which read only that.
export function consentWith(accepted: string | null, provider: string) {
  const providers = [...consentNames(accepted).filter((name) => name !== provider), provider];
  return JSON.stringify({ provider, providers });
}

export type AskGate = "loading" | "no-ai" | "consent" | "ready";

// undefined means not read yet. Nothing is sent unless this says "ready": accepted, for the AI that would get it now.
export function askGate(provider: string | null | undefined, accepted: string | null | undefined): AskGate {
  if (provider === undefined || accepted === undefined) return "loading";
  if (provider === null) return "no-ai";
  return consentNames(accepted).includes(provider) ? "ready" : "consent";
}

export function cleanQuestion(raw: string): string | null {
  const question = raw.trim();
  return question && question.length <= ASK_QUESTION_MAX ? question : null;
}

// What came before a question, by position (a retried answer lands right after its question): the answered turns,
// newest ten, each cut to the server's limit.
export function historyFor(items: ChatItem[], id: number): AskTurn[] {
  const before = items.slice(0, Math.max(items.findIndex((item) => item.id === id), 0));
  return before
    .filter((item) => !item.failed)
    .slice(-ASK_HISTORY_TURNS)
    .map(({ role, content }) => ({ role, content: content.slice(0, ASK_TURN_MAX) }));
}

export type Exchange = { question: ChatItem; answer: ChatItem | null };

// Each question with the answer that follows it, newest first, so the field stays at the top and the latest answer is in view.
export function exchanges(items: ChatItem[]): Exchange[] {
  const list: Exchange[] = [];
  for (const item of items) {
    if (item.role === "user") list.push({ question: item, answer: null });
    else if (list.length && !list[list.length - 1].answer) list[list.length - 1].answer = item;
  }
  return list.reverse();
}

export const askBody = (question: string, history: AskTurn[], locale: "en" | "ar") => ({ question, history, locale });

// What the Today brief does: no acceptance, or one for another AI, means no AI call at all (the rule-based lines show instead).
export type BriefStep = "consent" | "no-ai" | "ask";

export function briefStep(accepted: string | null, provider: string | null): BriefStep {
  if (accepted === null) return "consent";
  const gate = askGate(provider, accepted);
  return gate === "ready" ? "ask" : gate === "no-ai" ? "no-ai" : "consent";
}

// Withdrawing removes the agreement and the saved AI brief, which was written from data sent under it.
export const withdrawKeys = (userId: string) => [consentKey(userId), briefCacheKey(userId)];

// The server's own message is English; in Arabic only the local text is shown, never a mix.
export const serverDetail = (error: unknown, arabic: boolean) => (!arabic && error instanceof Error ? error.message : "");
