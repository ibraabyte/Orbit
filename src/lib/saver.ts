import { isArabic } from "@/lib/i18n";
import type { Capture } from "@/lib/types";
import { sourceLabel } from "@/lib/url";

// The saver ("الحافظة"): links shared from TikTok, X or anywhere, kept with a title, picture, category and short summary.
// The server reads each link (backend/app/routers/saver.py); this file is the screen's plain logic and words.

export const BUILT_IN_CATEGORIES = ["video", "post", "book", "movie", "article", "place", "other"] as const;
export type BuiltInCategory = (typeof BUILT_IN_CATEGORIES)[number];
export type SaverStatus = Capture["status"];
export type StatusFilter = SaverStatus | "all";
export const STATUS_FILTERS: readonly StatusFilter[] = ["want", "done", "all"];

export type SaveResult = { capture: Capture; existed: boolean };

const en = {
  title: "Saver",
  pasteLink: "Paste a link",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  alreadySaved: "Already saved",
  all: "All",
  newCategory: "New",
  newCategoryTitle: "New category",
  newCategoryBody: "A name for it, like Gifts or Recipes.",
  categories: { video: "Videos", post: "Posts", book: "Books", movie: "Movies", article: "Articles", place: "Places", other: "Other" } as Record<BuiltInCategory, string>,
  statuses: { want: "To see", done: "Seen", all: "All" } as Record<StatusFilter, string>,
  search: "Search saved links",
  empty: "Nothing saved yet. Share a link from TikTok, X or any app and pick Orbit, or paste one above.",
  emptyFilter: "Nothing here. Try another category or clear the search.",
  open: "Open",
  markDone: "Mark seen",
  markWant: "Back to To see",
  moveTo: "Move to category",
  summarize: "Summarize with AI",
  summarizing: "Summarizing…",
  findInSeerr: "Find in Movies & TV",
  remove: "Delete",
  removeTitle: "Delete this link?",
  removeBody: "It's removed from your saver.",
  cancel: "Cancel",
  notALink: "That doesn't look like a web link.",
  connectAi: "Connect an AI in Integrations to get summaries.",
  sharedHint: "From the share sheet",
  count: (n: number) => `${n} saved`
};

const ar: typeof en = {
  title: "الحافظة",
  pasteLink: "الصق رابط",
  save: "احفظ",
  saving: "جارٍ الحفظ…",
  saved: "انحفظ",
  alreadySaved: "محفوظ من قبل",
  all: "الكل",
  newCategory: "قسم جديد",
  newCategoryTitle: "قسم جديد",
  newCategoryBody: "اسم القسم، مثل هدايا أو وصفات.",
  categories: { video: "فيديوهات", post: "تغريدات ومنشورات", book: "كتب", movie: "أفلام", article: "مقالات", place: "أماكن", other: "أخرى" },
  statuses: { want: "أبغى أشوفه", done: "شفته", all: "الكل" },
  search: "ابحث في المحفوظات",
  empty: "ما حفظت شي للحين. شارك رابط من تيك توك أو تويتر أو أي تطبيق واختر Orbit، أو الصق الرابط فوق.",
  emptyFilter: "ما فيه شي هنا. جرّب قسم ثاني أو امسح البحث.",
  open: "افتح",
  markDone: "شفته",
  markWant: "رجّعه لأبغى أشوفه",
  moveTo: "انقله لقسم",
  summarize: "لخّصه بالذكاء",
  summarizing: "جارٍ التلخيص…",
  findInSeerr: "دوّره في الأفلام والمسلسلات",
  remove: "احذف",
  removeTitle: "تحذف هذا الرابط؟",
  removeBody: "بينشال من الحافظة.",
  cancel: "إلغاء",
  notALink: "هذا ما يبدو رابط.",
  connectAi: "اربط ذكاء اصطناعي من التكاملات عشان يطلع لك ملخص.",
  sharedHint: "من المشاركة",
  count: (n: number) => `${n} محفوظ`
};

export const st = isArabic ? ar : en;

export function isBuiltIn(category: string): category is BuiltInCategory {
  return (BUILT_IN_CATEGORIES as readonly string[]).includes(category);
}

export function categoryLabel(category: string) {
  return isBuiltIn(category) ? st.categories[category] : category;
}

/** Built-in categories first (in their fixed order), then the user's own, by name; each once. */
export function categoryList(captures: Pick<Capture, "category">[], extra: string[] = []) {
  const own = new Set<string>();
  for (const name of [...captures.map((capture) => capture.category), ...extra]) {
    const trimmed = name?.trim();
    if (trimmed && !isBuiltIn(trimmed)) own.add(trimmed);
  }
  return [...BUILT_IN_CATEGORIES, ...[...own].sort((a, b) => a.localeCompare(b))];
}

export function categoryCounts(captures: Pick<Capture, "category" | "status">[], status: StatusFilter = "all") {
  const counts = new Map<string, number>();
  for (const capture of captures) {
    if (status !== "all" && capture.status !== status) continue;
    counts.set(capture.category, (counts.get(capture.category) ?? 0) + 1);
  }
  return counts;
}

export function siteLabel(capture: Pick<Capture, "site_name" | "source" | "url">) {
  if (capture.site_name) return capture.site_name;
  const host = capture.source ?? hostOf(capture.url);
  return sourceLabel(host) ?? host ?? null;
}

function hostOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

const folds: [RegExp, string][] = [
  [/[أإآ]/g, "ا"],
  [/ى/g, "ي"],
  [/ة/g, "ه"],
  [/[ً-ْـ]/g, ""]
];

/** Lowercase, and Arabic letters that are often typed either way made the same (أ/ا, ة/ه, ى/ي, no tashkeel). */
export function fold(text: string) {
  return folds.reduce((value, [pattern, to]) => value.replace(pattern, to), text.toLowerCase());
}

export function filterSaved(captures: Capture[], { category, status, query }: { category: string | null; status: StatusFilter; query: string }) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return captures.filter((capture) => {
    if (category && capture.category !== category) return false;
    if (status !== "all" && capture.status !== status) return false;
    if (!words.length) return true;
    const haystack = fold([capture.title, capture.summary, capture.note, capture.url, siteLabel(capture), categoryLabel(capture.category)].filter(Boolean).join(" "));
    return words.every((word) => haystack.includes(word));
  });
}

const URL_IN_TEXT = /https?:\/\/[^\s<>"'«»]+/i;

/** The first web link in shared or pasted text ("Look at this! https://vm.tiktok.com/ZS…/"), without trailing punctuation. */
export function findLink(text: string | null | undefined): string | null {
  const match = text?.match(URL_IN_TEXT)?.[0];
  if (!match) return null;
  return match.replace(/[.,;:!?)\]}،؟]+$/, "");
}

/** What came in from the iOS share sheet: the page's link (or one inside the shared text) and the title the app sent. */
export function sharedLink(intent: { webUrl?: string | null; text?: string | null; meta?: { title?: string | null } | null } | null | undefined) {
  if (!intent) return null;
  const url = findLink(intent.webUrl) ?? findLink(intent.text);
  if (!url) return null;
  const title = intent.meta?.title?.trim() || null;
  return { url, title };
}

/** The saved list after a save: the new link on top, or the existing one moved there. */
export function withSaved(captures: Capture[], saved: Capture) {
  return [saved, ...captures.filter((capture) => capture.id !== saved.id)];
}

export function replaced(captures: Capture[], next: Capture) {
  return captures.map((capture) => (capture.id === next.id ? next : capture));
}
