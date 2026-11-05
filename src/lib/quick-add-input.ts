import { parseQuickAdd, validateQuickAddDraft, type QuickAddDraft } from "@/lib/quick-add";
import type { FinanceCategory, WeightUnit } from "@/lib/types";

// Turns plain speech ("expense 25 lunch tomorrow", "صرفت 25 غداء بكرة") into the
// "kind: ... @date" syntax parseQuickAdd expects, so nobody has to learn the syntax.

const firstWordKinds: Record<string, string> = {
  // English: same words parseQuickAdd accepts before a colon.
  todo: "task", remind: "reminder", reminder: "reminder", note: "capture", link: "capture", capture: "capture",
  meal: "meal", ate: "meal", grocery: "grocery", groceries: "grocery", buy: "grocery", workout: "workout", gym: "workout",
  weight: "weight", sleep: "sleep", slept: "sleep", expense: "expense", spent: "expense", spend: "expense",
  paid: "expense", bill: "bill", subscription: "bill", habit: "habit",
  // Arabic (Saudi everyday words).
  مهمة: "task", مهمه: "task", ذكرني: "reminder", تذكير: "reminder", ملاحظة: "capture", ملاحظه: "capture", رابط: "capture",
  اكلت: "meal", أكلت: "meal", وجبة: "meal", وجبه: "meal", مقاضي: "grocery", اشتري: "grocery", شراء: "grocery",
  تمرين: "workout", تمرنت: "workout", وزني: "weight", وزن: "weight", نمت: "sleep", نوم: "sleep",
  صرفت: "expense", مصروف: "expense", دفعت: "expense", فاتورة: "bill", فاتوره: "bill", اشتراك: "bill",
  عادة: "habit", عاده: "habit"
};

const arabicDays: [RegExp, string][] = [
  [/بعد\s+بكر[ةها]/, "in 2 days"],
  [/(?:الأسبوع|الاسبوع)\s+(?:الجاي|القادم)/, "next week"],
  [/(?:الشهر)\s+(?:الجاي|القادم)/, "next month"],
  [/اليوم/, "today"],
  [/الليل[ةه]/, "tonight"],
  [/بكر[ةها]|غد[اًا]?/, "tomorrow"],
  [/(?:يوم\s+)?(?:الأحد|الاحد)/, "sunday"],
  [/(?:يوم\s+)?(?:الإثنين|الاثنين)/, "monday"],
  [/(?:يوم\s+)?الثلاثاء/, "tuesday"],
  [/(?:يوم\s+)?(?:الأربعاء|الاربعاء)/, "wednesday"],
  [/(?:يوم\s+)?الخميس/, "thursday"],
  [/(?:يوم\s+)?الجمع[ةه]/, "friday"],
  [/(?:يوم\s+)?السبت/, "saturday"]
];

// Spending words: "غداء 45" or "بنزين ١٢٠" alone is an expense, and these set its category.
// Words that already start another kind (gym, groceries, اشتري) are left out so they keep their meaning.
const spendingWords: [FinanceCategory, string[]][] = [
  ["food", ["غداء", "عشاء", "عشا", "فطور", "فطار", "قهوة", "قهوه", "كوفي", "شاي", "مطعم", "كافيه", "برقر", "شاورما", "بيتزا", "lunch", "dinner", "breakfast", "coffee", "cafe", "restaurant"]],
  ["transport", ["بنزين", "وقود", "تاكسي", "اوبر", "أوبر", "كريم", "مواصلات", "موقف", "مواقف", "باص", "مترو", "قطار", "تعبئة", "fuel", "gas", "petrol", "taxi", "uber", "careem", "parking"]],
  ["groceries", ["بقالة", "بقاله", "سوبرماركت", "تموينات", "خضار", "supermarket"]],
  ["shopping", ["ملابس", "تسوق", "هدية", "هديه", "امازون", "أمازون", "نون", "clothes", "amazon", "gift"]],
  ["health", ["صيدلية", "صيدليه", "دواء", "علاج", "مستشفى", "دكتور", "pharmacy", "medicine", "doctor"]],
  ["services", ["حلاق", "حلاقة", "حلاقه", "مغسلة", "مغسله", "غسيل", "barber", "laundry"]],
  ["bills", ["كهرباء", "كهربا", "انترنت", "إنترنت", "جوال", "electricity", "internet"]],
  ["home", ["ايجار", "إيجار", "rent"]],
  ["travel", ["طيران", "فندق", "تذكرة", "تذكره", "flight", "hotel"]]
];
const spendingCategory = new Map(spendingWords.flatMap(([category, words]) => words.map((word) => [word, category] as const)));

/** The category a spending word points to ("البنزين" counts as "بنزين"), or null. */
export function guessFinanceCategory(text: string): FinanceCategory | null {
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const word = raw.replace(/[.,،!؟?]+$/, "");
    const found = spendingCategory.get(word) ?? spendingCategory.get(word.replace(/^(?:بال|وال|ال)/, ""));
    if (found) return found;
  }
  return null;
}

// "غداء 45", "45 بنزين", "قهوة 18 ريال": a few words, one amount, a spending word, and no date or time.
function looksLikeQuickExpense(text: string) {
  if ((text.match(/\d+(?:\.\d+)?/g) ?? []).length !== 1) return false;
  if (/:|\b(?:am|pm)\b|الساع[ةه]/i.test(text) || moveDateToMarker(text) !== text) return false;
  const words = text.replace(/\d+(?:\.\d+)?/, " ").replace(/ريال|ر\.س|\bsar\b/gi, " ").trim().split(/\s+/).filter(Boolean);
  return words.length >= 1 && words.length <= 4 && guessFinanceCategory(words.join(" ")) !== null;
}

const englishDate =
  /\s+((?:today|tonight|tomorrow|next\s+week|next\s+month|(?:next\s+)?(?:monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun))(?:\s+(?:at\s+)?(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon))?)$/i;

export function naturalToCommand(input: string, options: { defaultCurrency?: string } = {}) {
  let text = toWesternDigits(input).trim().replace(/\s+/g, " ");

  // Already in "kind: ..." form: leave the kind alone.
  let kind: string | null = /^https?:\/\//i.test(text) ? "capture" : null;
  if (!kind && !/^[^\s:]+\s*:/.test(text)) {
    const [first, ...rest] = text.split(" ");
    kind = firstWordKinds[first.toLowerCase()] ?? null;
    if (kind) text = rest.join(" ");
    // "subscription netflix 45" / "اشتراك نتفلكس 45" should land in Subscriptions.
    if (/^(?:subscription|اشتراك)$/i.test(first) && !/#subscriptions\b/.test(text)) text += " #subscriptions";
    if (!kind && looksLikeQuickExpense(text)) kind = "expense";
  }

  text = arabicUnits(text);
  text = moveDateToMarker(text);
  if ((kind === "expense" || kind === "bill") && options.defaultCurrency) {
    // Only before the "@date" part, so "9am" never becomes money.
    const at = text.indexOf(" @");
    const head = at < 0 ? text : text.slice(0, at);
    text = head.replace(/(\d+(?:\.\d+)?)(?=\s|$)(?!\s*[A-Za-z]{3}\b)/, `$1 ${options.defaultCurrency}`) + (at < 0 ? "" : text.slice(at));
  }

  return { command: kind ? `${kind}: ${text}` : text, inferredKind: Boolean(kind) };
}

// ponytail: a guessed kind that fails validation ("focus on email") falls back to a plain task.
export function parseNatural(input: string, options: { defaultCurrency?: string; defaultWeightUnit?: WeightUnit; now?: Date } = {}) {
  const { command, inferredKind } = naturalToCommand(input, options);
  const draft = withGuessedCategory(parseQuickAdd(command, options), input);
  const validation = validateQuickAddDraft(draft, command);
  if (validation.ok || !inferredKind) return { command, draft, validation };
  const plain = naturalToCommand(`task: ${input.trim()}`, options).command;
  const task = parseQuickAdd(plain, options);
  return { command: plain, draft: task, validation: validateQuickAddDraft(task, plain) };
}

// An expense with no category said ("صرفت 40 بنزين") gets one from its words.
function withGuessedCategory(draft: QuickAddDraft, input: string): QuickAddDraft {
  if (draft.kind !== "expense" || draft.financeCategory !== "other") return draft;
  const guessed = guessFinanceCategory(toWesternDigits(input));
  return guessed ? { ...draft, financeCategory: guessed } : draft;
}

export function describeDraft(draft: QuickAddDraft) {
  const parts: string[] = [kindLabels[draft.kind], draft.title];
  if (draft.amount) parts.push(`${draft.amount} ${draft.currency}`);
  if (draft.sleepMinutes) parts.push(`${Math.round((draft.sleepMinutes / 60) * 10) / 10}h`);
  else if (draft.durationMinutes) parts.push(`${draft.durationMinutes} min`);
  if (draft.weight && draft.kind === "weight") parts.push(`${draft.weight} ${draft.unit}`);
  if (draft.calories) parts.push(`${draft.calories} kcal`);
  if (draft.at) parts.push(new Date(draft.at).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }));
  if (draft.priority === "high") parts.push("high");
  return parts.join(" · ");
}

const kindLabels: Record<QuickAddDraft["kind"], string> = {
  task: "Task", reminder: "Reminder", capture: "Note", meal: "Meal", mealPlan: "Meal plan", grocery: "Grocery",
  workout: "Workout", weight: "Weight", sleep: "Sleep", expense: "Expense",
  bill: "Bill", habit: "Habit"
};

function toWesternDigits(value: string) {
  return value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660)).replace(/٫/g, ".");
}

function arabicUnits(value: string) {
  return value
    .replace(/ساعتين/g, "2h")
    .replace(/(\d+(?:\.\d+)?)\s*(?:ساعات|ساعة|ساعه)/g, "$1h")
    .replace(/(\d+)\s*(?:دقيقة|دقيقه|دقايق|دقائق)/g, "$1min")
    .replace(/(\d+(?:\.\d+)?)\s*(?:ريال|ر\.س)/g, "$1 SAR")
    .replace(/(\d+(?:\.\d+)?)\s*(?:كيلو|كجم|كغ)/g, "$1kg")
    .replace(/(\d+)\s*(?:سعرة|سعره|سعرات|كالوري)/g, "$1kcal");
}

// Finds a date said in words and rewrites it as the "@..." token the parser understands.
function moveDateToMarker(value: string) {
  if (/(^|\s)@\S/.test(value)) return value;

  for (const [pattern, english] of arabicDays) {
    const match = value.match(new RegExp(`(?:^|\\s)(${pattern.source})(?:\\s+(?:الساعة|الساعه)\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(الصبح|الصباح|ص|العصر|المغرب|المسا|المساء|م|بالليل)?)?(?=\\s|$)`));
    if (!match) continue;
    const time = match[2] ? ` ${arabicHour(Number(match[2]), match[4])}:${match[3] ?? "00"}` : "";
    const rest = (value.slice(0, match.index) + value.slice((match.index ?? 0) + match[0].length)).replace(/\s+/g, " ").trim();
    // "in 2 days" is a relative token and takes no clock time.
    return `${rest} @${english}${english.startsWith("in ") ? "" : time}`.trim();
  }

  const match = value.match(englishDate);
  return match ? `${value.slice(0, match.index)} @${match[1].replace(/\s+at\s+/i, " ")}` : value;
}

function arabicHour(hour: number, period?: string) {
  const evening = period && !/^(?:الصبح|الصباح|ص)$/.test(period);
  if (evening && hour < 12) return hour + 12;
  // ponytail: no period → 1–6 means afternoon (nobody books 3 at night), else as said.
  if (!period && hour >= 1 && hour <= 6) return hour + 12;
  return hour;
}
