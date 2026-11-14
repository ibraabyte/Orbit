import { digits, isArabic } from "@/lib/i18n";
import type { Capture, SavedItem, SavedMedia } from "@/lib/types";
import { sourceLabel } from "@/lib/url";

// The saver ("الحافظة"): links shared from TikTok, X or anywhere, kept with a title, picture, category and short summary.
// The server reads each link (backend/app/routers/saver.py); this file is the screen's plain logic and words.

export const BUILT_IN_CATEGORIES = ["video", "post", "book", "movie", "article", "place", "other"] as const;
export type BuiltInCategory = (typeof BUILT_IN_CATEGORIES)[number];
export type SaverStatus = Capture["status"];
export type StatusFilter = SaverStatus | "all";
export const STATUS_FILTERS: readonly StatusFilter[] = ["want", "done", "all"];

export type SaveResult = { capture: SavedItem; existed: boolean };
export type SmartSearch = { ids: string[]; terms: string[] };

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
  count: (n: number) => `${digits(n)} saved`,
  // The smart saver
  analyzing: "Looking at it…",
  analyzeFailed: "Couldn't look at it.",
  noAi: "Connect an AI in Integrations to get tags and a summary.",
  tryAgain: "Try again",
  analyzeAgain: "Look at it again",
  smartSearch: (query: string) => `Search by meaning for “${query}”`,
  smartSearching: "Searching by meaning…",
  smartResults: (n: number) => `${digits(n)} found by meaning`,
  smartNone: "Nothing found by meaning either.",
  clearSmart: "Back to all",
  searchedFor: "Searched for",
  savingFile: "Saving the file…",
  savedFile: "Saved. Orbit is looking at it.",
  tags: "Tags",
  addTag: "Add a tag",
  noTags: "No tags yet.",
  whatsInIt: "What's in it",
  postText: "The post's text",
  yourNote: "Your note",
  editNote: "Edit note",
  notePlaceholder: "Why you saved it",
  copyKept: "Copy kept on your server",
  noCopy: "No copy kept",
  playVideo: "Play video",
  videoBadge: "Video",
  openOriginal: "Open the original",
  details: "Details",
  by: (author: string) => `By ${author}`,
  sizeMb: (mb: string) => `${mb} MB`,
  kinds: { link: "Link", note: "Text", image: "Picture", video: "Video", screenshot: "Picture" } as Record<Capture["type"], string>
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
  count: (n: number) => `${digits(n)} محفوظ`,
  analyzing: "يحلله الحين…",
  analyzeFailed: "ما قدر يحلله.",
  noAi: "اربط ذكاء اصطناعي من التكاملات عشان تطلع التاجات والملخص.",
  tryAgain: "جرّب مرة ثانية",
  analyzeAgain: "حلّله من جديد",
  smartSearch: (query: string) => `دوّر بالمعنى عن «${query}»`,
  smartSearching: "يدوّر بالمعنى…",
  smartResults: (n: number) => `لقى ${digits(n)} بالمعنى`,
  smartNone: "ولا لقى شي بالمعنى.",
  clearSmart: "رجوع للكل",
  searchedFor: "دوّر عن",
  savingFile: "جارٍ حفظ الملف…",
  savedFile: "انحفظ. Orbit يحلله الحين.",
  tags: "التاجات",
  addTag: "أضف تاج",
  noTags: "ما فيه تاجات للحين.",
  whatsInIt: "وش فيه",
  postText: "نص المنشور",
  yourNote: "ملاحظتك",
  editNote: "عدّل الملاحظة",
  notePlaceholder: "ليش حفظته",
  copyKept: "نسخة محفوظة في سيرفرك",
  noCopy: "ما انحفظت نسخة",
  playVideo: "شغّل المقطع",
  videoBadge: "مقطع",
  openOriginal: "افتح الأصل",
  details: "التفاصيل",
  by: (author: string) => `من ${author}`,
  sizeMb: (mb: string) => `${mb} ميجا`,
  kinds: { link: "رابط", note: "نص", image: "صورة", video: "مقطع", screenshot: "صورة" }
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

export function filterSaved<T extends Capture>(captures: T[], { category, status, query }: { category: string | null; status: StatusFilter; query: string }) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return captures.filter((capture) => {
    if (category && capture.category !== category) return false;
    if (status !== "all" && capture.status !== status) return false;
    if (!words.length) return true;
    const haystack = fold(
      [
        capture.title,
        capture.summary,
        capture.note,
        capture.url,
        siteLabel(capture),
        categoryLabel(capture.category),
        ...(capture.labels ?? []),
        capture.analysis,
        capture.content_text,
        capture.search_terms,
        capture.author
      ]
        .filter(Boolean)
        .join(" ")
    );
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
export function withSaved<T extends Capture>(captures: T[], saved: T) {
  return [saved, ...captures.filter((capture) => capture.id !== saved.id)];
}

export function replaced<T extends Capture>(captures: T[], next: T) {
  return captures.map((capture) => (capture.id === next.id ? next : capture));
}

// The smart saver

/** The picture to show for an item in a list: the video's still or the first picture kept, else none. */
export function posterOf(item: Pick<SavedItem, "media">): SavedMedia | null {
  const images = item.media.filter((media) => media.kind === "image");
  return images.find((media) => media.poster) ?? images[0] ?? null;
}

export function videoOf(item: Pick<SavedItem, "media">): SavedMedia | null {
  return item.media.find((media) => media.kind === "video") ?? null;
}

/** The pictures to show in an item's page (the video's still is shown by the player instead). */
export function picturesOf(item: Pick<SavedItem, "media">): SavedMedia[] {
  const video = videoOf(item);
  return item.media.filter((media) => media.kind === "image" && !(video && media.poster));
}

export function isWorking(items: Pick<Capture, "analysis_status">[]) {
  return items.some((item) => item.analysis_status === "pending");
}

/** The smart search's results, in its order, from what is already loaded. */
export function inOrder<T extends { id: string }>(items: T[], ids: string[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is T => Boolean(item));
}

export type SharedFile = { uri: string; name: string; type: string };

/** Pictures and videos shared from the Photos app or any app (expo-share-intent's files), ready to upload. */
export function sharedFiles(intent: { files?: { path?: string | null; mimeType?: string | null; fileName?: string | null }[] | null } | null | undefined): SharedFile[] {
  return (intent?.files ?? [])
    .filter((file) => file.path && /^(image|video)\//.test(file.mimeType ?? ""))
    .slice(0, 10)
    .map((file) => {
      const path = file.path as string;
      const type = (file.mimeType as string).toLowerCase();
      const name = file.fileName || path.split("/").pop() || (type.startsWith("video/") ? "video.mp4" : "picture.jpg");
      return { uri: /^[a-z]+:\/\//i.test(path) ? path : `file://${path}`, name, type };
    });
}

/** Shared text with no link in it is saved as a note; text with a link saves the link. */
export function sharedText(intent: { text?: string | null; webUrl?: string | null } | null | undefined) {
  const text = intent?.text?.trim();
  if (!text || findLink(text) || findLink(intent?.webUrl)) return null;
  return text.slice(0, 8000);
}

/** Tags after adding one: trimmed, no '#', no repeats ignoring case, at most 20. */
export function addTag(tags: string[], tag: string) {
  const word = tag.replace(/#/g, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!word || tags.some((existing) => existing.toLowerCase() === word.toLowerCase())) return tags;
  return [...tags, word].slice(0, 20);
}

export function megabytes(bytes: number | null) {
  if (!bytes) return null;
  const mb = bytes / (1024 * 1024);
  return digits(mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10);
}
