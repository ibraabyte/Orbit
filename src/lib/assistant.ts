import type { ApiClient } from "@/lib/api";
import { digits } from "@/lib/i18n";
import { parseNatural, naturalToCommand } from "@/lib/quick-add-input";
import type { WeightUnit } from "@/lib/types";

// The Orbit assistant, the button in the middle of the tab bar. A plain quick-add line ("غداء 45", "ذكرني بكرة 9 اتصل")
// is understood here at once, with no AI. Anything else goes to POST /assistant/act, where the person's own AI proposes
// changes; the phone shows them, and only the ones the person confirms are sent, each to that item's own route.
// Shapes mirror backend/app/routers/assistant.py and backend/app/services/assistant_actions.py.

export const ACT_TEXT_MAX = 1000;
export const ACT_HISTORY_TURNS = 10;
export const ACT_TURN_MAX = 1500;

export type ActionOp = "create" | "update" | "delete" | "complete";
export type ProposedAction = { op: ActionOp; kind: string; id: string | null; label: string; fields: Record<string, unknown> };
export type ActReply = { reply: string; actions: ProposedAction[] };
export type ActTurn = { role: "user" | "assistant"; content: string };

// Each kind the assistant can change, and the route that already saves it. Anything else is never sent.
export const KIND_PATHS: Record<string, string> = {
  task: "/tasks",
  task_list: "/task-lists",
  reminder: "/reminders",
  expense: "/expenses",
  bill: "/bills",
  budget: "/budgets",
  meal: "/meals",
  grocery: "/grocery-items",
  workout: "/workouts",
  sleep: "/sleep-logs",
  weight: "/weight-logs",
  habit: "/habits",
  habit_log: "/habit-logs",
  note: "/captures",
  money_account: "/money-accounts",
  investment: "/investments",
  card: "/cards"
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ActionRequest = { method: "POST" | "PATCH" | "DELETE"; path: string; body?: Record<string, unknown> };

// The call that applies one confirmed change, or null when the change isn't one this app knows how to make.
export function actionRequest(action: ProposedAction): ActionRequest | null {
  const base = KIND_PATHS[action.kind];
  if (!base || !action.fields || typeof action.fields !== "object") return null;
  if (action.op === "create") return action.id === null ? { method: "POST", path: base, body: action.fields } : null;
  if (!action.id || !UUID.test(action.id)) return null;
  if (action.op === "update") return Object.keys(action.fields).length ? { method: "PATCH", path: `${base}/${action.id}`, body: action.fields } : null;
  if (action.op === "delete") return { method: "DELETE", path: `${base}/${action.id}` };
  if (action.op === "complete" && action.kind === "task") return { method: "POST", path: `${base}/${action.id}/complete` };
  return null;
}

type Api = Pick<ApiClient, "post" | "patch" | "delete">;

// Applies the confirmed changes one after another. A failed one doesn't stop the rest; each failure says which and why.
export async function applyActions(api: Api, actions: ProposedAction[]) {
  const failed: { action: ProposedAction; message: string }[] = [];
  let done = 0;
  for (const action of actions) {
    const request = actionRequest(action);
    if (!request) {
      failed.push({ action, message: "Not a change Orbit can make." });
      continue;
    }
    try {
      if (request.method === "POST") await api.post(request.path, request.body);
      else if (request.method === "PATCH") await api.patch(request.path, request.body);
      else await api.delete(request.path);
      done += 1;
    } catch (error) {
      failed.push({ action, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { done, failed };
}

// A line the quick-add parser is sure about: it starts with a kind word ("صرفت", "ذكرني", "remind") or is a short
// spending line ("غداء 45"), and it reads without guessing. Those skip the AI. Anything else goes to the assistant.
export function instantDraft(input: string, options: { defaultCurrency?: string; defaultWeightUnit?: WeightUnit; now?: Date } = {}) {
  const text = input.trim();
  if (!text) return null;
  const { command, inferredKind } = naturalToCommand(text, options);
  if (!inferredKind) return null;
  const parsed = parseNatural(text, options);
  // parseNatural falls back to a plain task when the guessed kind doesn't fit; that is a guess, so the AI decides.
  return parsed.validation.ok && parsed.command === command ? parsed : null;
}

export const actBody = (text: string, history: ActTurn[], locale: "en" | "ar") => ({
  text: text.trim().slice(0, ACT_TEXT_MAX),
  history: history.slice(-ACT_HISTORY_TURNS).map(({ role, content }) => ({ role, content: content.slice(0, ACT_TURN_MAX) })),
  locale
});

// The names shown for each kind and change, in the app's language.
const KIND_NAMES: Record<string, [string, string]> = {
  task: ["Task", "مهمة"], task_list: ["Task list", "قائمة مهام"], reminder: ["Reminder", "تذكير"], expense: ["Expense", "مصروف"], bill: ["Bill", "فاتورة"],
  budget: ["Budget", "ميزانية"], meal: ["Meal", "وجبة"], grocery: ["Grocery", "مشتريات"], workout: ["Workout", "تمرين"],
  sleep: ["Sleep", "نوم"], weight: ["Weight", "وزن"], habit: ["Habit", "عادة"], habit_log: ["Habit done", "إنجاز عادة"],
  note: ["Note", "ملاحظة"], money_account: ["Money place", "مكان فلوس"],
  investment: ["Investment", "استثمار"], card: ["Card", "بطاقة"]
};
const OP_NAMES: Record<ActionOp, [string, string]> = { create: ["Add", "إضافة"], update: ["Change", "تعديل"], delete: ["Delete", "حذف"], complete: ["Done", "إنجاز"] };

export const kindName = (kind: string, arabic: boolean) => (KIND_NAMES[kind] ?? [kind, kind])[arabic ? 1 : 0];
export const opName = (op: ActionOp, arabic: boolean) => OP_NAMES[op][arabic ? 1 : 0];

const FIELD_NAMES: Record<string, [string, string]> = {
  title: ["Title", "العنوان"], name: ["Name", "الاسم"], merchant: ["Where", "المكان"], amount: ["Amount", "المبلغ"], currency: ["Currency", "العملة"],
  category: ["Category", "الفئة"], due_at: ["Due", "الموعد"], remind_at: ["Remind at", "وقت التذكير"], spent_at: ["When", "الوقت"],
  logged_at: ["When", "الوقت"], priority: ["Priority", "الأولوية"], recurrence: ["Repeats", "التكرار"], status: ["Status", "الحالة"],
  calories: ["Calories", "السعرات"], duration_minutes: ["Minutes", "الدقائق"], weight: ["Weight", "الوزن"], unit: ["Unit", "الوحدة"],
  notes: ["Notes", "ملاحظات"], note: ["Note", "ملاحظة"], body: ["Details", "التفاصيل"], month: ["Month", "الشهر"], quantity: ["Quantity", "الكمية"],
  sleep_date: ["Night of", "ليلة"], quality: ["Quality", "الجودة"], target_at: ["Target date", "التاريخ المستهدف"], birthday: ["Birthday", "الميلاد"],
  relationship: ["Relationship", "العلاقة"], next_follow_up_at: ["Next follow-up", "المتابعة القادمة"], balance: ["Balance", "الرصيد"],
  invested: ["Invested", "المستثمر"], current_value: ["Value now", "القيمة الحالية"], kind: ["Type", "النوع"], last4: ["Last 4", "آخر 4"],
  meal_type: ["Meal", "الوجبة"], frequency: ["How often", "كم مرة"], target_count: ["Target", "الهدف"], type: ["Type", "النوع"], url: ["Link", "الرابط"],
  list_name: ["List", "القائمة"], steps: ["Checklist", "الخطوات"], autopay: ["Autopay", "دفع تلقائي"], network: ["Network", "الشبكة"], protein_g: ["Protein g", "بروتين غ"], carbs_g: ["Carbs g", "كارب غ"], fat_g: ["Fat g", "دهون غ"]
};
// Ids are shown as the item they point at (the action's label) or not at all.
const HIDDEN_FIELDS = new Set(["habit_id", "task_id", "card_id", "list_id", "tags"]);

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function formatValue(value: unknown, locale: string): string {
  if (value === null) return "—";
  if (typeof value === "boolean") return value ? "✓" : "✗";
  if (Array.isArray(value)) return value.map((item) => formatValue(item, locale)).join(" · ");
  if (typeof value === "number") return digits(value.toLocaleString(locale));
  if (typeof value === "string" && ISO_TIME.test(value)) {
    const at = new Date(value);
    if (!Number.isNaN(at.getTime())) return digits(at.toLocaleString(locale, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }));
  }
  if (typeof value === "string" && ISO_DAY.test(value)) {
    const day = new Date(`${value}T12:00:00`);
    if (!Number.isNaN(day.getTime())) return digits(day.toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" }));
  }
  return String(value);
}

// The fields of a proposed change as [name, value] rows, read straight from what would be sent (never the AI's words).
export function actionRows(action: ProposedAction, arabic: boolean): [string, string][] {
  const locale = arabic ? "ar-SA-u-nu-latn" : "en-US";
  return Object.entries(action.fields)
    .filter(([key]) => !HIDDEN_FIELDS.has(key))
    .map(([key, value]) => [(FIELD_NAMES[key] ?? [key, key])[arabic ? 1 : 0], formatValue(value, locale)]);
}
