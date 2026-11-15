import type { ApiClient } from "@/lib/api";
import { formatMoney } from "@/lib/finance";
import { digits, formatDate, isArabic } from "@/lib/i18n";

// The subscription hunter and read-only Gmail live on Orbit's own server (backend/app/routers/subscriptions.py and
// gmail.py). Shapes mirror their JSON.

export type FindStatus = "new" | "kept" | "cancelled" | "tracked" | "dismissed";
export type FindFlag = "untracked" | "price_up" | "trial_ending" | "duplicate" | "charged_after_cancel";
export type FindPeriod = "weekly" | "monthly" | "yearly";

export type SubscriptionFind = {
  id: string;
  key: string;
  name: string;
  kind: string | null;
  period: FindPeriod;
  amount: number | null;
  currency: string | null;
  previous_amount: number | null;
  monthly_cost: number | null;
  first_seen_on: string;
  last_charged_on: string;
  next_expected_on: string | null;
  charges: number;
  sources: string[];
  flags: string[];
  evidence: string | null;
  cancel_url: string;
  cancel_is_search: boolean;
  status: FindStatus;
  bill_id: string | null;
};

export type GmailStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  connected_at: string | null;
  last_error: string | null;
};

export type HunterOverview = {
  finds: SubscriptionFind[];
  scanned_at: string | null;
  emails_read: number;
  email_error: string | null;
  gmail: GmailStatus;
  monthly: Record<string, number>;
  untracked_monthly: Record<string, number>;
};

type Api = Pick<ApiClient, "get" | "post" | "patch" | "delete">;

export const hunterApi = {
  overview: (api: Api) => api.get<HunterOverview>("/subscriptions"),
  scan: (api: Api) => api.post<HunterOverview>("/subscriptions/scan"),
  decide: (api: Api, id: string, status: Exclude<FindStatus, "tracked">) => api.patch<SubscriptionFind>(`/subscriptions/${encodeURIComponent(id)}`, { status }),
  track: (api: Api, id: string, amount?: number, currency?: string) =>
    api.post<SubscriptionFind>(`/subscriptions/${encodeURIComponent(id)}/track`, amount === undefined ? {} : { amount, currency }),
  gmailStatus: (api: Api) => api.get<GmailStatus>("/gmail/status"),
  gmailConnectUrl: (api: Api, returnTo: string) => api.post<{ url: string }>("/gmail/connect", { return_to: returnTo }),
  gmailDisconnect: (api: Api) => api.delete("/gmail/connection")
};

const en = {
  title: "Subscription hunter",
  rowDetail: "Forgotten subscriptions in your spending and email",
  intro: "Orbit looks through your expenses, bank SMS and, if you link it, your email receipts for things that keep charging you.",
  scan: "Look for subscriptions",
  scanning: "Looking…",
  scanAgain: "Look again",
  lastScan: (when: string) => `Last look ${when}`,
  emailsRead: (n: number) => `${digits(n)} emails read`,
  nothingYet: "Nothing found yet. Press the button to look.",
  nothingFound: "No subscriptions found. Add expenses or link your email, then look again.",
  running: "Running a month",
  notInBills: "Not in your bills",
  needsLook: "Needs a look",
  keeping: "Keeping",
  setAside: "Cancelled or set aside",
  monthly: "a month",
  yearly: "a year",
  weekly: "a week",
  periods: { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" } as Record<FindPeriod, string>,
  noPrice: "Price unknown",
  last: (date: string) => `Last ${date}`,
  next: (date: string) => `Next ${date}`,
  charges: (n: number) => (n === 1 ? "Seen once" : `Seen ${digits(n)} times`),
  flags: {
    untracked: "Not in bills",
    price_up: "Price went up",
    trial_ending: "Trial ending",
    duplicate: "Two of a kind",
    charged_after_cancel: "Still charging"
  } as Record<FindFlag, string>,
  sources: { expenses: "Expenses", bank: "Bank SMS", email: "Email" } as Record<string, string>,
  priceWas: (was: string) => `Was ${was}`,
  cancelIt: "Open the cancel page",
  howToCancel: "Search how to cancel",
  didCancel: "Did you cancel it?",
  yesCancelled: "Yes, I cancelled it",
  notYet: "Not yet",
  keep: "Keep it",
  addToBills: "Add to my bills",
  notSub: "Not a subscription",
  undo: "Back to Needs a look",
  openBill: "Open Finance",
  typeAmount: "Orbit didn't see the price. Type it to add it to your bills.",
  amount: "Amount",
  added: "Added to Bills & subscriptions.",
  marked: "Saved.",
  // Gmail
  gmail: "Email (Gmail)",
  gmailIntro: "Link Gmail to find receipts, renewals and free trials about to end. Orbit only reads, it never sends or deletes, and keeps only the sender, subject and price.",
  gmailConnect: "Link Gmail",
  gmailConnecting: "Linking…",
  gmailLinked: "Linked",
  gmailRelink: "Link again",
  gmailConnected: (email: string) => `Linked: ${email}`,
  gmailDisconnect: "Unlink Gmail",
  gmailDisconnected: "Gmail unlinked. What was found stays.",
  gmailNotSetUp: "Google isn't set up on the server yet.",
  gmailUnlinkTitle: "Unlink Gmail?",
  gmailUnlinkDetail: "Orbit stops reading your email and asks Google to remove its access.",
  results: {
    connected: "Gmail linked. Press Look again to read it.",
    denied: "Gmail access wasn't allowed.",
    expired: "That took too long. Try again.",
    error: "Linking Gmail failed. Try again.",
    no_mail_scope: "Tick “Read your email” on Google's page so Orbit can read receipts.",
    api_off: "The Gmail API is off in Google Cloud. Turn it on, then try again.",
    bad_setup: "Google refused Orbit's settings. Check the redirect link and the gmail.readonly scope in Google Cloud.",
    not_configured: "Google isn't set up on the server yet."
  } as Record<string, string>
};

const ar: typeof en = {
  title: "صائد الاشتراكات",
  rowDetail: "الاشتراكات المنسية في مصاريفك وبريدك",
  intro: "يدوّر لك Orbit في مصاريفك ورسائل البنك، وفي إيصالات بريدك إذا ربطته، على الأشياء اللي تنخصم منك كل فترة.",
  scan: "دوّر على الاشتراكات",
  scanning: "يدوّر…",
  scanAgain: "دوّر مرة ثانية",
  lastScan: (when: string) => `آخر بحث ${when}`,
  emailsRead: (n: number) => `قرأ ${digits(n)} رسالة`,
  nothingYet: "ما فيه نتائج للحين. اضغط الزر عشان يدوّر.",
  nothingFound: "ما لقى اشتراكات. أضف مصاريفك أو اربط بريدك، ثم دوّر مرة ثانية.",
  running: "شغّالة بالشهر",
  notInBills: "مو في فواتيرك",
  needsLook: "تحتاج نظرة",
  keeping: "باقية",
  setAside: "ملغاة أو مستبعدة",
  monthly: "بالشهر",
  yearly: "بالسنة",
  weekly: "بالأسبوع",
  periods: { weekly: "أسبوعي", monthly: "شهري", yearly: "سنوي" },
  noPrice: "السعر غير معروف",
  last: (date: string) => `آخر خصم ${date}`,
  next: (date: string) => `القادم ${date}`,
  charges: (n: number) => (n === 1 ? "شفناه مرة" : `شفناه ${digits(n)} مرات`),
  flags: {
    untracked: "مو في الفواتير",
    price_up: "زاد السعر",
    trial_ending: "التجربة تخلص",
    duplicate: "مكرر النوع",
    charged_after_cancel: "ما زال ينخصم"
  },
  sources: { expenses: "المصاريف", bank: "رسائل البنك", email: "البريد" },
  priceWas: (was: string) => `كان ${was}`,
  cancelIt: "افتح صفحة الإلغاء",
  howToCancel: "ابحث عن طريقة الإلغاء",
  didCancel: "ألغيته؟",
  yesCancelled: "إيه، ألغيته",
  notYet: "لسه",
  keep: "خلّه",
  addToBills: "أضفه لفواتيري",
  notSub: "مو اشتراك",
  undo: "رجّعه لـ«تحتاج نظرة»",
  openBill: "افتح المالية",
  typeAmount: "ما عرف Orbit السعر. اكتبه عشان ينضاف لفواتيرك.",
  amount: "المبلغ",
  added: "انضاف للفواتير والاشتراكات.",
  marked: "تم الحفظ.",
  gmail: "البريد (Gmail)",
  gmailIntro: "اربط Gmail عشان يلقى الإيصالات والتجديدات والتجارب المجانية اللي قربت تخلص. Orbit يقرأ فقط، ما يرسل ولا يحذف، ويحفظ المرسل والعنوان والسعر بس.",
  gmailConnect: "اربط Gmail",
  gmailConnecting: "يربط…",
  gmailLinked: "مربوط",
  gmailRelink: "يحتاج ربط",
  gmailConnected: (email: string) => `مربوط: \u2068${email}\u2069`,
  gmailDisconnect: "افصل Gmail",
  gmailDisconnected: "انفصل Gmail. اللي لقاه باقي.",
  gmailNotSetUp: "حساب Google مو مضبوط في الخادم للحين.",
  gmailUnlinkTitle: "تفصل Gmail؟",
  gmailUnlinkDetail: "Orbit يوقف قراءة بريدك ويطلب من Google يشيل صلاحيته.",
  results: {
    connected: "انربط Gmail. اضغط «دوّر مرة ثانية» عشان يقرأه.",
    denied: "ما سمحت بالوصول للبريد.",
    expired: "طوّلت العملية. جرّب مرة ثانية.",
    error: "ما نجح ربط Gmail. جرّب مرة ثانية.",
    no_mail_scope: "علّم على «قراءة بريدك» في صفحة Google عشان Orbit يقرأ الإيصالات.",
    api_off: "خدمة Gmail API مقفلة في Google Cloud. شغّلها ثم جرّب مرة ثانية.",
    bad_setup: "رفض Google إعدادات Orbit. راجع رابط الرجوع وصلاحية gmail.readonly في Google Cloud.",
    not_configured: "حساب Google مو مضبوط في الخادم للحين."
  }
};

export const st = isArabic ? ar : en;

/** What the server's redirect (orbit://...?status=...) means, in words for the screen. */
export function gmailResultMessage(url: string | null | undefined): { ok: boolean; message: string } | null {
  const status = url ? /[?&]status=([a-z_]+)/.exec(url)?.[1] : undefined;
  if (!status) return null;
  return { ok: status === "connected", message: st.results[status] ?? st.results.error };
}

// Keeps "SAR 45" in one piece inside an Arabic line, so the amount and the currency don't swap places.
const money = (amount: number, currency: string) => (isArabic ? `\u2068${formatMoney(amount, currency)}\u2069` : formatMoney(amount, currency));

const day = (date: string) => formatDate(`${date.slice(0, 10)}T12:00:00`);

/** One amount, kept whole inside Arabic text. */
export const priceOnly = money;

export function priceLine(find: SubscriptionFind): string {
  if (find.amount === null || !find.currency) return st.noPrice;
  return `${money(find.amount, find.currency)} ${st[find.period]}`;
}

export function datesLine(find: SubscriptionFind): string {
  // A cancelled or set-aside one has no next charge to wait for.
  const upcoming = find.next_expected_on && find.status !== "cancelled" && find.status !== "dismissed" ? find.next_expected_on : null;
  const parts = [find.charges ? st.last(day(find.last_charged_on)) : null, upcoming ? st.next(day(upcoming)) : null];
  return parts.filter(Boolean).join(" · ");
}

/** The row's line under the name: how often, then the last and next charge. */
export function rowLine(find: SubscriptionFind): string {
  return [st.periods[find.period], datesLine(find)].filter(Boolean).join(" · ");
}

/** The row's number on the side: just the price, or a dash when unknown. */
export function rowPrice(find: SubscriptionFind): string {
  return find.amount === null || !find.currency ? "–" : money(find.amount, find.currency);
}

export function sourcesLine(find: SubscriptionFind): string {
  return find.sources.map((source) => st.sources[source] ?? source).join(" · ");
}

export function flagLabels(find: SubscriptionFind): { flag: FindFlag; label: string; urgent: boolean }[] {
  const order: FindFlag[] = ["charged_after_cancel", "trial_ending", "price_up", "untracked", "duplicate"];
  return order
    .filter((flag) => find.flags.includes(flag))
    .map((flag) => ({ flag, label: st.flags[flag], urgent: flag === "charged_after_cancel" || flag === "trial_ending" || flag === "price_up" }));
}

export type FindGroups = { needsLook: SubscriptionFind[]; keeping: SubscriptionFind[]; setAside: SubscriptionFind[] };

export function groupFinds(finds: SubscriptionFind[]): FindGroups {
  return {
    // A cancelled one that still charges goes back to the top. A new one with nothing to flag is already in your bills.
    needsLook: finds.filter((f) => (f.status === "new" && f.flags.length > 0) || (f.status === "cancelled" && f.flags.includes("charged_after_cancel"))),
    keeping: finds.filter((f) => f.status === "kept" || f.status === "tracked" || (f.status === "new" && !f.flags.length)),
    setAside: finds.filter((f) => (f.status === "cancelled" && !f.flags.includes("charged_after_cancel")) || f.status === "dismissed")
  };
}

/** Every currency's total, biggest first: the main one for a tile, the rest for a line under it ("+ $9.99"). */
export function totalsParts(totals: Record<string, number>): { main: string; rest: string } {
  const parts = Object.entries(totals)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([currency, amount]) => money(amount, currency));
  return { main: parts[0] ?? "", rest: parts.length > 1 ? `+ ${parts.slice(1).join(" + ")}` : "" };
}

/** How many finds want a decision, for a badge on the Finance row. */
export function needsLookCount(finds: SubscriptionFind[]): number {
  return groupFinds(finds).needsLook.length;
}

/** Turns what the user typed ("14.99", "١٤٫٩٩") into a price, or null. */
export function parsePrice(text: string): number | null {
  const western = text.trim().replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".").replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(western)) return null;
  const value = Number(western);
  return value > 0 && value <= 1_000_000 ? value : null;
}
