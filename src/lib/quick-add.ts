import { financeCategories } from "@/lib/finance";
import { groceryCategories } from "@/lib/food";
import type { BillRecurrence, CaptureType, FinanceCategory, GroceryCategory, HabitFrequency, JournalMood, MealPlanType, RecurrenceRule, TaskPriority, WeightUnit } from "@/lib/types";

export type QuickAddKind =
  | "task"
  | "reminder"
  | "capture"
  | "meal"
  | "mealPlan"
  | "grocery"
  | "person"
  | "workout"
  | "weight"
  | "sleep"
  | "focus"
  | "expense"
  | "bill"
  | "habit"
  | "goal"
  | "journal";

export type QuickAddDraft = {
  kind: QuickAddKind;
  title: string;
  note: string | null;
  tags: string[];
  priority: TaskPriority;
  recurrence: RecurrenceRule | null;
  at: string | null;
  reminderAt: string | null;
  url: string | null;
  captureType: CaptureType;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  mealType: MealPlanType;
  groceryQuantity: string | null;
  groceryCategory: GroceryCategory;
  personRelationship: string | null;
  contactMethod: string | null;
  birthday: string | null;
  favorite: boolean;
  durationMinutes: number | null;
  weight: number | null;
  unit: WeightUnit;
  sleepMinutes: number | null;
  sleepQuality: number | null;
  focusEnergy: number | null;
  amount: number | null;
  currency: string;
  financeCategory: FinanceCategory;
  billRecurrence: BillRecurrence;
  billAutopay: boolean;
  frequency: HabitFrequency;
  mood: JournalMood;
};

export type QuickAddValidation = {
  ok: boolean;
  message: string | null;
};

const weekdaySource = "monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun";
const timePhraseSource = "(?:\\s+(?:at\\s*)?(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?|noon|midnight))?";
const isoDateSource = "\\d{4}-\\d{2}-\\d{2}(?:[T\\s]\\d{1,2}:\\d{2})?";
const relativeDateSource =
  "in\\s+\\d+(?:\\.\\d+)?\\s*(?:minutes|minute|mins|min|months|month|mos|mo|hours|hour|hrs|hr|weeks|week|days|day|m|h|d|w)";
const namedDateSource =
  `(?:today|tonight|tomorrow|next[-\\s]week|next[-\\s]month|next[-\\s](?:${weekdaySource})|${weekdaySource})(?:[T-]\\d{1,2}:\\d{2}|${timePhraseSource})`;
const dateTokenSource = `(?:${isoDateSource}|${relativeDateSource}|${namedDateSource})`;

const kindAliases: Record<string, QuickAddKind> = {
  task: "task",
  todo: "task",
  reminder: "reminder",
  remind: "reminder",
  capture: "capture",
  link: "capture",
  note: "capture",
  meal: "meal",
  food: "meal",
  mealplan: "mealPlan",
  "meal-plan": "mealPlan",
  planmeal: "mealPlan",
  grocery: "grocery",
  groceries: "grocery",
  shopping: "grocery",
  person: "person",
  people: "person",
  contact: "person",
  workout: "workout",
  train: "workout",
  weight: "weight",
  sleep: "sleep",
  recovery: "sleep",
  focus: "focus",
  session: "focus",
  deepwork: "focus",
  expense: "expense",
  spend: "expense",
  purchase: "expense",
  bill: "bill",
  subscription: "bill",
  sub: "bill",
  habit: "habit",
  routine: "habit",
  goal: "goal",
  journal: "journal",
  mood: "journal"
};

export function parseQuickAdd(input: string, options: { defaultWeightUnit?: WeightUnit; now?: Date } = {}): QuickAddDraft {
  const { kind, body } = splitKind(input);
  const tags = [...body.matchAll(/#([\w-]+)/g)].map((match) => match[1]);
  const priority = extractPriority(body);
  const recurrence = extractTaskRecurrence(kind, body);
  const at = extractDateToken(body, "@", options.now);
  const reminderAt = extractDateToken(body, "~", options.now);
  const bodyWithoutDateTokens = removeDateTokens(body);
  const url = body.match(/https?:\/\/[^\s]+/i)?.[0] ?? null;
  const calories = extractNumberToken(body, /\b(\d+(?:\.\d+)?)\s*(?:cal|kcal)\b/i);
  const proteinG = extractMacroToken(kind, body, "protein");
  const carbsG = extractMacroToken(kind, body, "carbs");
  const fatG = extractMacroToken(kind, body, "fat");
  const durationMinutes = extractNumberToken(body, /\b(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes)\b/i);
  const sleepMinutes = extractSleepMinutes(kind, body);
  const sleepQuality = extractSleepQuality(kind, body);
  const focusEnergy = extractFocusEnergy(kind, body);
  const money = extractMoneyToken(kind, bodyWithoutDateTokens);
  const weightMatch =
    kind === "weight" ? bodyWithoutDateTokens.match(/\b(\d+(?:\.\d+)?)\s*(kg|lb)?\b/i) : body.match(/\b(\d+(?:\.\d+)?)\s*(kg|lb)\b/i);
  const frequency = /\bweekly\b/i.test(body) ? "weekly" : "daily";
  const financeCategory = extractFinanceCategory(body, tags);
  const mealType = extractMealType(body);
  const groceryQuantity = extractGroceryQuantity(kind, body);
  const groceryCategory = extractGroceryCategory(body, tags);
  const personRelationship = extractPersonRelationship(kind, body, tags);
  const contactMethod = extractPersonContactMethod(kind, body);
  const birthday = extractPersonBirthday(kind, body);
  const favorite = /\b(favorite|fav)\b/i.test(body);
  const billRecurrence = extractBillRecurrence(body);
  const billAutopay = extractBillAutopay(kind, body);
  const mood = extractMood(body);
  const cleaned = cleanBody(kind, groceryQuantity.body);

  return {
    kind,
    title: cleaned || fallbackTitle(kind),
    note: kind === "journal" || kind === "capture" ? cleaned || null : null,
    tags,
    priority,
    recurrence,
    at,
    reminderAt,
    url,
    captureType: url ? "link" : "note",
    calories,
    proteinG,
    carbsG,
    fatG,
    mealType,
    groceryQuantity: groceryQuantity.quantity,
    groceryCategory,
    personRelationship,
    contactMethod,
    birthday,
    favorite,
    durationMinutes,
    weight: weightMatch ? Number(weightMatch[1]) : null,
    unit: (weightMatch?.[2]?.toLowerCase() as WeightUnit | undefined) ?? options.defaultWeightUnit ?? "kg",
    sleepMinutes,
    sleepQuality,
    focusEnergy,
    amount: money.amount,
    currency: money.currency,
    financeCategory,
    billRecurrence,
    billAutopay,
    frequency,
    mood
  };
}

export function validateQuickAddDraft(draft: QuickAddDraft, input = ""): QuickAddValidation {
  const markerError = unresolvedDateMarker(input, draft);
  if (markerError) return { ok: false, message: markerError };

  if (draft.kind === "weight" && !draft.weight) {
    return { ok: false, message: "Weight commands need a value like 82kg or 180lb." };
  }

  if (draft.kind === "sleep" && !draft.sleepMinutes) {
    return { ok: false, message: "Sleep commands need a duration like 7.5h or 450min." };
  }

  if (draft.kind === "focus" && !draft.durationMinutes) {
    return { ok: false, message: "Focus commands need a duration like 50min." };
  }

  if (draft.kind === "expense" && !draft.amount) {
    return { ok: false, message: "Expense commands need an amount like 4.50 USD." };
  }

  if (draft.kind === "bill" && !draft.amount) {
    return { ok: false, message: "Bill commands need an amount like 65 USD." };
  }

  return { ok: true, message: null };
}

function splitKind(input: string) {
  const trimmed = input.trim();
  const match = trimmed.match(/^([\w-]+)\s*:\s*(.*)$/);
  if (!match) return { kind: "task" as QuickAddKind, body: trimmed };
  return {
    kind: kindAliases[match[1].toLowerCase()] ?? "task",
    body: match[2].trim()
  };
}

function extractPriority(value: string): TaskPriority {
  if (/!high\b/i.test(value)) return "high";
  if (/!low\b/i.test(value)) return "low";
  return "normal";
}

function extractTaskRecurrence(kind: QuickAddKind, value: string): RecurrenceRule | null {
  if (kind !== "task") return null;
  const recurrence = value.match(/\b(?:repeat|repeats|every)\s+(daily|weekly|monthly|day|week|month)\b/i)?.[1]?.toLowerCase();
  if (recurrence === "daily" || recurrence === "day") return "daily";
  if (recurrence === "weekly" || recurrence === "week") return "weekly";
  if (recurrence === "monthly" || recurrence === "month") return "monthly";
  return null;
}

function extractMood(value: string): JournalMood {
  const mood = value.match(/\b(great|good|neutral|low|bad)\b/i)?.[1]?.toLowerCase();
  if (mood === "great" || mood === "good" || mood === "neutral" || mood === "low" || mood === "bad") return mood;
  return "neutral";
}

function extractDateToken(value: string, marker: "@" | "~", now = new Date()) {
  const token = value.match(dateTokenPattern(marker))?.[1];
  if (!token) return null;
  return parseDateToken(token, now);
}

function dateTokenPattern(marker: "@" | "~", flags = "i") {
  return new RegExp(`${marker}\\s*(${dateTokenSource})`, flags);
}

function removeDateTokens(value: string) {
  return value.replace(dateTokenPattern("@", "gi"), "").replace(dateTokenPattern("~", "gi"), "");
}

function unresolvedDateMarker(input: string, draft: QuickAddDraft) {
  if (!input.trim()) return null;
  const withoutKnownDates = removeDateTokens(input);

  if (!draft.at && /(^|\s)@[\w-]/.test(withoutKnownDates)) {
    return "Due date was not recognized. Try @tomorrow 9am or @2026-07-05.";
  }

  if (!draft.reminderAt && /(^|\s)~[\w-]/.test(withoutKnownDates)) {
    return "Reminder time was not recognized. Try ~in 2 hours or ~tomorrow at 8am.";
  }

  return null;
}

function parseDateToken(token: string, now: Date) {
  const normalized = token.trim().toLowerCase().replace(/\s+/g, " ");
  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:[t\s](\d{1,2}):(\d{2}))?$/i);
  if (isoMatch) {
    const [, year, month, day, hour = "12", minute = "00"] = isoMatch;
    return dateFromParts(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  }

  const relative = parseRelativeDateToken(normalized, now);
  if (relative) return relative;

  const { name, hour, minute } = splitNaturalDateToken(normalized);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const defaultHour = name === "tonight" ? 20 : 12;
  const targetHour = hour ?? defaultHour;
  const targetMinute = minute ?? 0;

  if (name === "today" || name === "tonight") {
    return dateFromParts(base.getFullYear(), base.getMonth(), base.getDate(), targetHour, targetMinute);
  }

  if (name === "tomorrow") {
    base.setDate(base.getDate() + 1);
    return dateFromParts(base.getFullYear(), base.getMonth(), base.getDate(), targetHour, targetMinute);
  }

  if (name === "next week") {
    base.setDate(base.getDate() + 7);
    return dateFromParts(base.getFullYear(), base.getMonth(), base.getDate(), targetHour, targetMinute);
  }

  if (name === "next month") {
    base.setMonth(base.getMonth() + 1);
    return dateFromParts(base.getFullYear(), base.getMonth(), base.getDate(), targetHour, targetMinute);
  }

  if (name.startsWith("next ")) {
    const weekday = weekdayIndexes[name.replace(/^next\s+/, "")];
    if (weekday !== undefined) {
      const daysUntil = ((weekday - base.getDay() + 7) % 7) || 7;
      base.setDate(base.getDate() + daysUntil);
      return dateFromParts(base.getFullYear(), base.getMonth(), base.getDate(), targetHour, targetMinute);
    }
  }

  const weekday = weekdayIndexes[name];
  if (weekday !== undefined) {
    const daysUntil = (weekday - base.getDay() + 7) % 7;
    base.setDate(base.getDate() + daysUntil);
    return dateFromParts(base.getFullYear(), base.getMonth(), base.getDate(), targetHour, targetMinute);
  }

  return null;
}

function splitNaturalDateToken(token: string) {
  const normalized = token.replace(/-/g, " ").replace(/\s+/g, " ").trim();
  const time = normalized.match(/\s+(?:at\s*)?(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)$/i);
  if (time) {
    const parsed = parseTimePhrase(time[1]);
    if (parsed) {
      return {
        name: normalized.slice(0, time.index).trim(),
        hour: parsed.hour,
        minute: parsed.minute
      };
    }
  }

  const compactTime = token.match(/^(.+?)[t-](\d{1,2}):(\d{2})$/i);
  if (compactTime) {
    return {
      name: compactTime[1].replace(/-/g, " ").trim(),
      hour: Number(compactTime[2]),
      minute: Number(compactTime[3])
    };
  }

  return {
    name: normalized,
    hour: null,
    minute: null
  };
}

function parseRelativeDateToken(token: string, now: Date) {
  const match = token.match(/^in\s+(\d+(?:\.\d+)?)\s*(minutes|minute|mins|min|months|month|mos|mo|hours|hour|hrs|hr|weeks|week|days|day|m|h|d|w)$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const date = new Date(now);

  if (unit === "m" || unit === "min" || unit === "mins" || unit === "minute" || unit === "minutes") {
    date.setMinutes(date.getMinutes() + amount);
  } else if (unit === "h" || unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours") {
    date.setMinutes(date.getMinutes() + amount * 60);
  } else if (unit === "d" || unit === "day" || unit === "days") {
    date.setDate(date.getDate() + amount);
  } else if (unit === "w" || unit === "week" || unit === "weeks") {
    date.setDate(date.getDate() + amount * 7);
  } else {
    date.setMonth(date.getMonth() + amount);
  }

  return date.toISOString();
}

function parseTimePhrase(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "noon") return { hour: 12, minute: 0 };
  if (normalized === "midnight") return { hour: 0, minute: 0 };

  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const period = match[3];

  if (period === "am" && hour === 12) hour = 0;
  if (period === "pm" && hour < 12) hour += 12;
  if (hour > 23 || minute > 59) return null;

  return { hour, minute };
}

function dateFromParts(year: number, month: number, day: number, hour: number, minute: number) {
  if (hour > 23 || minute > 59) return null;
  return new Date(year, month, day, hour, minute).toISOString();
}

const weekdayIndexes: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

function extractNumberToken(value: string, pattern: RegExp) {
  const match = value.match(pattern);
  return match ? Number(match[1]) : null;
}

function extractMacroToken(kind: QuickAddKind, value: string, macro: "protein" | "carbs" | "fat") {
  if (kind !== "meal" && kind !== "mealPlan") return null;
  const compactUnit = { protein: "p", carbs: "c", fat: "f" }[macro];
  const labelPattern =
    macro === "protein"
      ? /\b(?:protein|prot)\s*(\d+(?:\.\d+)?)\s*g?\b/i
      : macro === "carbs"
        ? /\bcarbs?\s*(\d+(?:\.\d+)?)\s*g?\b/i
        : /\bfat\s*(\d+(?:\.\d+)?)\s*g?\b/i;
  const compactPattern = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*${compactUnit}\\b`, "i");
  const labelMatch = value.match(labelPattern);
  const compactMatch = value.match(compactPattern);
  return labelMatch ? Number(labelMatch[1]) : compactMatch ? Number(compactMatch[1]) : null;
}

function extractMoneyToken(kind: QuickAddKind, value: string) {
  if (kind !== "expense" && kind !== "bill") return { amount: null, currency: "USD" };
  const match = value.match(/\$?\s*(\d+(?:\.\d+)?)\s*([A-Za-z]{3})?\b/);
  return {
    amount: match ? Number(match[1]) : null,
    currency: match?.[2]?.toUpperCase() ?? "USD"
  };
}

function extractSleepMinutes(kind: QuickAddKind, value: string) {
  if (kind !== "sleep") return null;
  const hourMatch = value.match(/\b(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i);
  if (hourMatch) return Math.round(Number(hourMatch[1]) * 60);
  return extractNumberToken(value, /\b(\d+(?:\.\d+)?)\s*(?:m|min|mins|minutes)\b/i);
}

function extractSleepQuality(kind: QuickAddKind, value: string) {
  if (kind !== "sleep") return null;
  const match = value.match(/\b(?:quality|q)\s*([1-5])\b/i);
  return match ? Number(match[1]) : null;
}

function extractFocusEnergy(kind: QuickAddKind, value: string) {
  if (kind !== "focus") return null;
  const match = value.match(/\b(?:energy|e)\s*([1-5])\b/i);
  return match ? Number(match[1]) : null;
}

function extractFinanceCategory(value: string, tags: string[]): FinanceCategory {
  const tagCategory = tags.find((tag) => financeCategories.includes(tag.toLowerCase() as FinanceCategory));
  if (tagCategory) return tagCategory.toLowerCase() as FinanceCategory;
  const textCategory = financeCategories.find((category) => new RegExp(`\\b${category}\\b`, "i").test(value));
  return textCategory ?? "other";
}

function extractMealType(value: string): MealPlanType {
  const match = value.match(/\b(breakfast|lunch|dinner|snack|other)\b/i)?.[1]?.toLowerCase();
  if (match === "breakfast" || match === "lunch" || match === "dinner" || match === "snack" || match === "other") return match;
  return "other";
}

function extractGroceryCategory(value: string, tags: string[]): GroceryCategory {
  const tagCategory = tags.find((tag) => groceryCategories.includes(tag.toLowerCase() as GroceryCategory));
  if (tagCategory) return tagCategory.toLowerCase() as GroceryCategory;
  const textCategory = groceryCategories.find((category) => new RegExp(`\\b${category}\\b`, "i").test(value));
  return textCategory ?? "other";
}

function extractPersonRelationship(kind: QuickAddKind, value: string, tags: string[]) {
  if (kind !== "person") return null;
  const explicit = value.match(/\b(?:relationship|rel|as)\s+(.+?)(?=\s+(?:via|contact|phone|email|birthday|bday|favorite|fav)\b|\s[#@~]|$)/i)?.[1];
  const relationship = explicit ?? tags[0] ?? null;
  return relationship ? relationship.trim() : null;
}

function extractPersonContactMethod(kind: QuickAddKind, value: string) {
  if (kind !== "person") return null;
  const contact = value.match(/\b(?:via|contact|phone|email)\s+(.+?)(?=\s+(?:relationship|rel|as|birthday|bday|favorite|fav)\b|\s[#@~]|$)/i)?.[1];
  return contact ? contact.trim() : null;
}

function extractPersonBirthday(kind: QuickAddKind, value: string) {
  if (kind !== "person") return null;
  return value.match(/\b(?:birthday|bday)\s+(\d{4}-\d{2}-\d{2})\b/i)?.[1] ?? null;
}

const groceryQuantityUnits =
  "x|pack|packs|bag|bags|box|boxes|bottle|bottles|tub|tubs|can|cans|dozen|kg|g|lb|lbs|oz|l|liter|liters|ml|pc|pcs|piece|pieces|bunch|bunches|loaf|loaves|cup|cups|carton|cartons|jar|jars";
const groceryQuantityValue = `\\d+(?:\\.\\d+)?\\s*(?:${groceryQuantityUnits})?`;

function extractGroceryQuantity(kind: QuickAddKind, value: string): { quantity: string | null; body: string } {
  if (kind !== "grocery") return { quantity: null, body: value };

  const labeled = value.match(new RegExp(`\\b(?:qty|quantity)\\s*[:=]?\\s*(${groceryQuantityValue})\\b`, "i"));
  if (labeled) {
    return {
      quantity: normalizeGroceryQuantity(labeled[1]),
      body: value.replace(labeled[0], "")
    };
  }

  const compactPrefix = value.match(/^\s*x\s*(\d+(?:\.\d+)?)\b/i);
  if (compactPrefix) {
    return {
      quantity: normalizeGroceryQuantity(compactPrefix[1]),
      body: value.replace(compactPrefix[0], "")
    };
  }

  const compact = value.match(/\b(?:x\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*x)\b/i);
  if (compact) {
    return {
      quantity: normalizeGroceryQuantity(compact[1] ?? compact[2]),
      body: value.replace(compact[0], "")
    };
  }

  const prefixed = value.match(new RegExp(`^\\s*(${groceryQuantityValue})\\s+`, "i"));
  if (prefixed) {
    return {
      quantity: normalizeGroceryQuantity(prefixed[1]),
      body: value.replace(prefixed[0], "")
    };
  }

  const unitQuantity = value.match(new RegExp(`\\b(\\d+(?:\\.\\d+)?\\s*(?:${groceryQuantityUnits}))\\b`, "i"));
  if (unitQuantity) {
    return {
      quantity: normalizeGroceryQuantity(unitQuantity[1]),
      body: value.replace(unitQuantity[0], "")
    };
  }

  return { quantity: null, body: value };
}

function normalizeGroceryQuantity(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractBillRecurrence(value: string): BillRecurrence {
  const recurrence = value.match(/\b(once|weekly|monthly|yearly)\b/i)?.[1]?.toLowerCase();
  if (recurrence === "once" || recurrence === "weekly" || recurrence === "monthly" || recurrence === "yearly") return recurrence;
  return "monthly";
}

function extractBillAutopay(kind: QuickAddKind, value: string) {
  if (kind !== "bill") return false;
  if (/\b(?:manual|no[-\s]?autopay|not[-\s]?autopay)\b/i.test(value)) return false;
  return /\b(?:autopay|auto[-\s]?pay|paid automatically)\b/i.test(value);
}

function cleanBody(kind: QuickAddKind, value: string) {
  let cleaned = removeDateTokens(value)
    .replace(/#([\w-]+)/g, "")
    .replace(/!\b(high|normal|low)\b/gi, "")
    .replace(/https?:\/\/[^\s]+/gi, "");

  if (kind === "meal" || kind === "mealPlan") {
    cleaned = cleaned
      .replace(/\b\d+(?:\.\d+)?\s*(?:cal|kcal)\b/gi, "")
      .replace(/\b(?:protein|prot|carbs?|fat)\s*\d+(?:\.\d+)?\s*g?\b/gi, "")
      .replace(/\b\d+(?:\.\d+)?\s*[pcf]\b/gi, "")
      .replace(/\b(breakfast|lunch|dinner|snack|other)\b/gi, "");
  }
  if (kind === "grocery") cleaned = cleaned.replace(/\b(produce|protein|dairy|pantry|frozen|household|other)\b/gi, "");
  if (kind === "person") {
    cleaned = cleaned
      .replace(/\b(?:relationship|rel|as)\s+.+?(?=\s+(?:via|contact|phone|email|birthday|bday|favorite|fav)\b|\s[#@~]|$)/gi, "")
      .replace(/\b(?:via|contact|phone|email)\s+.+?(?=\s+(?:relationship|rel|as|birthday|bday|favorite|fav)\b|\s[#@~]|$)/gi, "")
      .replace(/\b(?:birthday|bday)\s+\d{4}-\d{2}-\d{2}\b/gi, "")
      .replace(/\b(favorite|fav)\b/gi, "");
  }
  if (kind === "workout") cleaned = cleaned.replace(/\b\d+(?:\.\d+)?\s*(?:cal|kcal|m|min|mins|minutes)\b/gi, "");
  if (kind === "weight") cleaned = cleaned.replace(/\b\d+(?:\.\d+)?\s*(?:kg|lb)?\b/gi, "");
  if (kind === "sleep") {
    cleaned = cleaned
      .replace(/\b\d+(?:\.\d+)?\s*(?:h|hr|hrs|hour|hours|m|min|mins|minutes)\b/gi, "")
      .replace(/\b(?:quality|q)\s*[1-5]\b/gi, "");
  }
  if (kind === "focus") cleaned = cleaned.replace(/\b\d+(?:\.\d+)?\s*(?:m|min|mins|minutes)\b/gi, "").replace(/\b(?:energy|e)\s*[1-5]\b/gi, "");
  if (kind === "task") cleaned = cleaned.replace(/\b(?:repeat|repeats|every)\s+(?:daily|weekly|monthly|day|week|month)\b/gi, "");
  if (kind === "expense" || kind === "bill") cleaned = cleaned.replace(/\$?\s*\b\d+(?:\.\d+)?\s*(?:[A-Za-z]{3})?\b/gi, "");
  if (kind === "bill") {
    cleaned = cleaned
      .replace(/\b(once|weekly|monthly|yearly)\b/gi, "")
      .replace(/\b(?:manual|no[-\s]?autopay|not[-\s]?autopay|autopay|auto[-\s]?pay|paid automatically)\b/gi, "");
  }
  if (kind === "habit") cleaned = cleaned.replace(/\b(daily|weekly)\b/gi, "");
  if (kind === "journal") cleaned = cleaned.replace(/\b(great|good|neutral|low|bad)\b/gi, "");

  return cleaned.replace(/\s+/g, " ").trim();
}

function fallbackTitle(kind: QuickAddKind) {
  const labels: Record<QuickAddKind, string> = {
    task: "Untitled task",
    reminder: "Untitled reminder",
    capture: "Untitled capture",
    meal: "Untitled meal",
    mealPlan: "Untitled meal plan",
    grocery: "Untitled grocery item",
    person: "Untitled person",
    workout: "Untitled workout",
    weight: "Weight log",
    sleep: "Sleep log",
    focus: "Focus session",
    expense: "Untitled expense",
    bill: "Untitled bill",
    habit: "Untitled habit",
    goal: "Untitled goal",
    journal: "Journal entry"
  };
  return labels[kind];
}
