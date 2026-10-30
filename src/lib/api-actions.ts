import type { ApiClient } from "@/lib/api";
import { validateQuickAddDraft, type QuickAddDraft } from "@/lib/quick-add";
import type { Task } from "@/lib/types";
import { sourceFromUrl } from "@/lib/url";

// Writes to Orbit's own server (backend/). Every row is scoped to the signed-in user by the server, so
// nothing here sends a user_id. Tag names ride along in the same call and the server attaches them.
type Api = Pick<ApiClient, "post" | "put">;

function day(at: string | null, fallback: string | null = new Date().toISOString()) {
  const value = at ?? fallback;
  return value ? value.slice(0, 10) : null;
}

// One quick-add line becomes one request: path and body for each kind.
export function quickAddRequest(draft: QuickAddDraft, now = new Date()): { method: "post" | "put"; path: string; body: Record<string, unknown> } {
  const nowIso = now.toISOString();
  const tags = draft.tags;
  switch (draft.kind) {
    case "task":
      // The server schedules the task's reminder in the same call.
      return {
        method: "post",
        path: "/tasks",
        body: { title: draft.title, notes: draft.note, priority: draft.priority, due_at: draft.at, reminder_at: draft.reminderAt, recurrence: draft.recurrence, tags }
      };
    case "reminder":
      return { method: "post", path: "/reminders", body: { title: draft.title, body: draft.note, remind_at: draft.reminderAt ?? draft.at ?? nowIso } };
    case "capture":
      return {
        method: "post",
        path: "/captures",
        body: { type: draft.captureType, title: draft.title, url: draft.url, note: draft.note, source: sourceFromUrl(draft.url), tags }
      };
    case "meal":
      return {
        method: "post",
        path: "/meals",
        body: { name: draft.title, calories: draft.calories ?? 0, protein_g: draft.proteinG, carbs_g: draft.carbsG, fat_g: draft.fatG, logged_at: draft.at ?? nowIso, tags }
      };
    case "mealPlan":
      return {
        method: "post",
        path: "/meal-plans",
        body: {
          name: draft.title,
          plan_date: day(draft.at, nowIso),
          meal_type: draft.mealType,
          calories: draft.calories ?? 0,
          protein_g: draft.proteinG,
          carbs_g: draft.carbsG,
          fat_g: draft.fatG,
          note: draft.note,
          tags
        }
      };
    case "grocery":
      return {
        method: "post",
        path: "/grocery-items",
        body: { name: draft.title, quantity: draft.groceryQuantity, category: draft.groceryCategory, due_at: day(draft.at, null), tags }
      };
    case "person":
      return {
        method: "post",
        path: "/people",
        body: {
          name: draft.title,
          relationship: draft.personRelationship,
          contact_method: draft.contactMethod,
          birthday: draft.birthday,
          next_follow_up_at: day(draft.at, null),
          notes: draft.note,
          favorite: draft.favorite
        }
      };
    case "workout":
      return {
        method: "post",
        path: "/workouts",
        body: { type: draft.title, duration_minutes: draft.durationMinutes, calories: draft.calories, notes: draft.note, logged_at: draft.at ?? nowIso, tags }
      };
    case "weight":
      if (!draft.weight) throw new Error("Weight commands need a value like 82kg or 180lb.");
      return { method: "post", path: "/weight-logs", body: { weight: draft.weight, unit: draft.unit, logged_at: draft.at ?? nowIso } };
    case "sleep":
      if (!draft.sleepMinutes) throw new Error("Sleep commands need a duration like 7.5h or 450min.");
      return {
        method: "post",
        path: "/sleep-logs",
        body: {
          sleep_date: day(draft.at, nowIso),
          duration_minutes: draft.sleepMinutes,
          quality: draft.sleepQuality,
          note: draft.title === "Sleep log" ? null : draft.title,
          tags
        }
      };
    case "focus": {
      if (!draft.durationMinutes) throw new Error("Focus commands need a duration like 50min.");
      const startedAt = draft.at ?? nowIso;
      const isPlanned = new Date(startedAt).getTime() > now.getTime();
      return {
        method: "post",
        path: "/focus-sessions",
        body: {
          title: draft.title,
          duration_minutes: draft.durationMinutes,
          started_at: startedAt,
          ended_at: isPlanned ? null : new Date(new Date(startedAt).getTime() + draft.durationMinutes * 60_000).toISOString(),
          status: isPlanned ? "planned" : "completed",
          energy: isPlanned ? null : draft.focusEnergy,
          note: draft.note,
          tags
        }
      };
    }
    case "expense":
      if (!draft.amount) throw new Error("Expense commands need an amount like 4.50 USD.");
      return {
        method: "post",
        path: "/expenses",
        body: { merchant: draft.title, amount: draft.amount, currency: draft.currency, category: draft.financeCategory, note: draft.note, spent_at: draft.at ?? nowIso, tags }
      };
    case "bill":
      if (!draft.amount) throw new Error("Bill commands need an amount like 65 USD.");
      return {
        method: "post",
        path: "/bills",
        body: {
          name: draft.title,
          amount: draft.amount,
          currency: draft.currency,
          category: draft.financeCategory,
          due_at: day(draft.at, nowIso),
          recurrence: draft.billRecurrence,
          autopay: draft.billAutopay,
          note: draft.note,
          tags
        }
      };
    case "habit":
      return { method: "post", path: "/habits", body: { name: draft.title, frequency: draft.frequency } };
    case "goal":
      return { method: "post", path: "/goals", body: { title: draft.title, notes: draft.note, target_at: day(draft.at, null) } };
    case "journal":
      // One entry per day: writing today again replaces it.
      return { method: "put", path: `/journal-entries/day/${day(draft.at, nowIso)}`, body: { mood: draft.mood, body: draft.title } };
  }
}

export async function apiQuickAdd(api: Api, draft: QuickAddDraft) {
  const validation = validateQuickAddDraft(draft);
  if (!validation.ok) throw new Error(validation.message ?? "Quick add command is incomplete.");
  const { method, path, body } = quickAddRequest(draft);
  return api[method](path, body);
}

// Done, cancel its reminders, and roll a repeating task forward (with its tags), all on the server.
export function apiCompleteTask(api: Pick<ApiClient, "post">, taskId: string) {
  return api.post<{ task: Task; next_task: Task | null }>(`/tasks/${encodeURIComponent(taskId)}/complete`);
}

// Partial update of one row the user owns, e.g. apiUpdate(api, "/bills", bill.id, { status: "paid" }).
export function apiUpdate(api: Pick<ApiClient, "patch">, collection: string, id: string, changes: Record<string, unknown>) {
  return api.patch(`${collection}/${encodeURIComponent(id)}`, changes);
}
