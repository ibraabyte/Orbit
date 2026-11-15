import type { ApiClient } from "@/lib/api";
import { digits, formatDate, isArabic } from "@/lib/i18n";
import type { GmailStatus } from "@/lib/subscriptions";

// The order tracker lives on Orbit's own server (backend/app/routers/shipments.py): tracking numbers you type or that
// come from shipping emails in your linked Gmail, followed through your own 17TRACK account. Shapes mirror its JSON.

export type ShipmentStatus = "pending" | "not_found" | "info_received" | "in_transit" | "out_for_delivery" | "pickup" | "delivered" | "failed" | "exception" | "expired";
export type ShipmentFlag = "late" | "stuck" | "problem" | "no_info";
export type ShipmentAlert = "delivered" | "problem" | "out_for_delivery" | "pickup" | "late";

export type ShipmentEvent = { at: string | null; text: string; place: string | null };

export type Shipment = {
  id: string;
  number: string;
  label: string | null;
  store: string | null;
  source: "manual" | "email";
  carrier_name: string | null;
  status: ShipmentStatus;
  sub_status: string | null;
  last_event: string | null;
  last_location: string | null;
  last_event_at: string | null;
  eta_on: string | null;
  delivered_at: string | null;
  events: ShipmentEvent[];
  registered: boolean;
  checked_at: string | null;
  error: string | null;
  archived: boolean;
  flags: string[];
  alert: ShipmentAlert | null;
  created_at: string;
};

export type TrackingStatus = { connected: boolean; connected_at: string | null; last_error: string | null; refreshed_at: string | null };

export type ShipmentsOverview = {
  shipments: Shipment[];
  tracking: TrackingStatus;
  gmail: GmailStatus;
  scanned_at: string | null;
  emails_read: number;
  email_error: string | null;
};

type Api = Pick<ApiClient, "get" | "post" | "put" | "patch" | "delete">;

export const shipmentsApi = {
  overview: (api: Api) => api.get<ShipmentsOverview>("/shipments"),
  refresh: (api: Api) => api.post<ShipmentsOverview>("/shipments/refresh"),
  add: (api: Api, number: string, label?: string) => api.post<Shipment>("/shipments", { number, label: label?.trim() || null }),
  rename: (api: Api, id: string, label: string) => api.patch<Shipment>(`/shipments/${encodeURIComponent(id)}`, { label: label.trim() || null }),
  hide: (api: Api, id: string) => api.patch<Shipment>(`/shipments/${encodeURIComponent(id)}`, { archived: true }),
  remove: (api: Api, id: string) => api.delete(`/shipments/${encodeURIComponent(id)}`),
  seen: (api: Api, ids: string[]) => api.post("/shipments/seen", { ids }),
  connect: (api: Api, apiKey: string) => api.put<TrackingStatus & { credits_left: number | null }>("/shipments/tracking", { api_key: apiKey.trim() }),
  disconnect: (api: Api) => api.delete("/shipments/tracking")
};

export const TRACKING_SIGNUP_URL = "https://api.17track.net";

/** Upper case, without spaces or dashes; what the server stores. */
export function cleanNumber(value: string) {
  return value
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[\s-]/g, "")
    .toUpperCase();
}

export function looksLikeNumber(value: string) {
  return /^[A-Z0-9]{5,40}$/.test(cleanNumber(value));
}

const ON_THE_WAY: ShipmentStatus[] = ["pending", "not_found", "info_received", "in_transit", "out_for_delivery", "pickup"];

/** What needs a look (late, stuck, a problem), what is still coming, and what arrived. */
export function groupShipments(shipments: Shipment[]) {
  const needsLook = shipments.filter((s) => s.status !== "delivered" && s.flags.length > 0);
  const coming = shipments.filter((s) => ON_THE_WAY.includes(s.status) && !needsLook.includes(s));
  const arrived = shipments.filter((s) => s.status === "delivered");
  return { needsLook, coming, arrived };
}

/** Shown as a number on More: late, stuck or with a problem. */
export function needsLookCount(shipments: Shipment[]) {
  return groupShipments(shipments).needsLook.filter((s) => s.flags.some((f) => f !== "no_info")).length;
}

export function shipmentTitle(shipment: Shipment) {
  return shipment.label || shipment.store || shipment.number;
}

const dayKey = (value: string) => value.slice(0, 10);
const dateText = (key: string) => formatDate(`${dayKey(key)}T12:00:00`, { day: "numeric", month: "short" });

/** Days from today to a YYYY-MM-DD day, in the phone's own calendar. */
export function daysUntil(day: string, now: Date) {
  const [y, m, d] = dayKey(day).split("-").map(Number);
  const target = Date.UTC(y, m - 1, d);
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

export function etaText(shipment: Shipment, now: Date) {
  if (shipment.status === "delivered") return shipment.delivered_at ? sx.arrivedOn(formatDate(shipment.delivered_at, { day: "numeric", month: "short" })) : sx.statuses.delivered;
  if (!shipment.eta_on) return null;
  const left = daysUntil(shipment.eta_on, now);
  if (left < 0) return sx.wasDue(dateText(shipment.eta_on));
  if (left === 0) return sx.dueToday;
  if (left === 1) return sx.dueTomorrow;
  return sx.dueOn(dateText(shipment.eta_on));
}

export function flagLabels(shipment: Shipment): { flag: ShipmentFlag; label: string; urgent: boolean }[] {
  const order: ShipmentFlag[] = ["problem", "late", "stuck", "no_info"];
  return order.filter((flag) => shipment.flags.includes(flag)).map((flag) => ({ flag, label: sx.flags[flag], urgent: flag !== "no_info" }));
}

/** The row's second line: where it is now, else why it's waiting. */
export function rowLine(shipment: Shipment, now: Date) {
  const where = shipment.status === "pending" ? (shipment.error ?? sx.waiting) : (shipment.last_event ?? sx.statuses[shipment.status]);
  return [where, etaText(shipment, now)].filter(Boolean).join(" · ");
}

export function rowMeta(shipment: Shipment) {
  return [shipment.carrier_name, shipment.label && shipment.store ? shipment.store : null].filter(Boolean).join(" · ") || null;
}

/** The sheet's text: number, carrier, status and the latest events, newest first. */
export function detailText(shipment: Shipment, now: Date, max = 6) {
  const head = [shipment.number, shipment.carrier_name, sx.statuses[shipment.status], etaText(shipment, now)].filter(Boolean).join(" · ");
  const events = shipment.events.slice(0, max).map((event) => {
    const when = event.at ? formatDate(event.at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null;
    return `• ${[when, event.text, event.place].filter(Boolean).join(" · ")}`;
  });
  const extra = shipment.events.length > max ? [sx.moreEvents(shipment.events.length - max)] : [];
  const error = shipment.error ? [shipment.error] : [];
  return [head, ...error, ...events, ...extra].join("\n");
}

/** The phone notification for an alert. */
export function alertContent(shipment: Shipment): { title: string; body: string } | null {
  if (!shipment.alert) return null;
  const name = shipmentTitle(shipment);
  return { title: sx.alerts[shipment.alert], body: [name, shipment.last_event].filter(Boolean).join(" · ") };
}

const en = {
  shipments: "Shipments",
  rowDetail: "Follow orders and get told when they're late or arrive",
  intro: "Paste a tracking number, or link Gmail and Orbit finds them in shipping emails. It checks every few hours and tells you when one is late or arrives.",
  numberPh: "Tracking number",
  labelPh: "What is it? (optional)",
  add: "Follow",
  adding: "Adding…",
  added: "Added.",
  badNumber: "That doesn't look like a tracking number.",
  refresh: "Check now",
  refreshing: "Checking…",
  lastCheck: (when: string) => `Checked ${when}`,
  emailsRead: (n: number) => `${digits(n)} emails read`,
  nothingYet: "No shipments yet. Add a tracking number above.",
  needsLook: "Needs a look",
  coming: "On the way",
  arrived: "Arrived",
  waiting: "Waiting for 17TRACK",
  dueToday: "Arriving today",
  dueTomorrow: "Arriving tomorrow",
  dueOn: (date: string) => `Expected ${date}`,
  wasDue: (date: string) => `Was expected ${date}`,
  arrivedOn: (date: string) => `Arrived ${date}`,
  moreEvents: (n: number) => `…and ${digits(n)} earlier updates`,
  statuses: {
    pending: "Waiting",
    not_found: "No news from the carrier yet",
    info_received: "The shop handed it over",
    in_transit: "On the way",
    out_for_delivery: "Out for delivery",
    pickup: "Ready for pickup",
    delivered: "Delivered",
    failed: "Delivery failed",
    exception: "A problem with the shipment",
    expired: "No updates for a long time"
  } as Record<ShipmentStatus, string>,
  flags: { late: "Late", stuck: "No news for days", problem: "Problem", no_info: "No info yet" } as Record<ShipmentFlag, string>,
  alerts: {
    delivered: "Your shipment arrived",
    out_for_delivery: "Out for delivery today",
    pickup: "Ready for pickup",
    problem: "A problem with your shipment",
    late: "Your shipment is late"
  } as Record<ShipmentAlert, string>,
  fromEmail: "From email",
  shareNumber: "Share the number",
  rename: "Rename",
  renamePh: "Name",
  hide: "Remove from the list",
  hidden: "Removed.",
  // 17TRACK
  tracking: "Tracking (17TRACK)",
  trackingIntro: "Orbit follows shipments with your own free 17TRACK account: about 3,000 carriers, Aramex, SMSA, Saudi Post, J&T and DHL among them. Make an account, copy the API key from Settings, and paste it here.",
  trackingKeyPh: "17TRACK API key",
  trackingConnect: "Link 17TRACK",
  trackingConnecting: "Checking the key…",
  trackingLinked: "Linked",
  trackingFix: "Check the key",
  trackingConnected: "17TRACK is linked. Each new tracking number uses one of your 17TRACK credits; checking it again is free.",
  trackingCredits: (n: number) => `${digits(n)} tracking credits left this year`,
  trackingOpenSite: "Open 17TRACK",
  trackingDisconnect: "Unlink 17TRACK",
  trackingUnlinkTitle: "Unlink 17TRACK?",
  trackingUnlinkDetail: "Orbit forgets the key. Your shipments stay, but stop updating until you link a key again.",
  trackingUnlinked: "17TRACK unlinked.",
  trackingNeeded: "Link 17TRACK below so Orbit can follow these.",
  notif: "Shipments",
  notifDetail: "Late, out for delivery, or arrived. Checked when you open Orbit."
};

const ar: typeof en = {
  shipments: "الشحنات",
  rowDetail: "تابع طلباتك وينبهك إذا تأخرت أو وصلت",
  intro: "الصق رقم التتبع، أو اربط Gmail ويطلّعها Orbit من رسايل الشحن. يتابعها كل كم ساعة، وينبهك إذا تأخرت أو وصلت.",
  numberPh: "رقم التتبع",
  labelPh: "وش هي؟ (اختياري)",
  add: "تابعها",
  adding: "أضيفها…",
  added: "انضافت.",
  badNumber: "هذا ما يبدو رقم تتبع.",
  refresh: "حدّث الحين",
  refreshing: "أحدّث…",
  lastCheck: (when: string) => `آخر تحديث ${when}`,
  emailsRead: (n: number) => `قرأت ${digits(n)} رسالة`,
  nothingYet: "ما فيه شحنات للحين. أضف رقم تتبع فوق.",
  needsLook: "تحتاج نظرة",
  coming: "في الطريق",
  arrived: "وصلت",
  waiting: "تنتظر 17TRACK",
  dueToday: "توصل اليوم",
  dueTomorrow: "توصل بكرة",
  dueOn: (date: string) => `متوقع توصل ${date}`,
  wasDue: (date: string) => `كان متوقع توصل ${date}`,
  arrivedOn: (date: string) => `وصلت ${date}`,
  moreEvents: (n: number) => `…و${digits(n)} تحديثات قبلها`,
  statuses: {
    pending: "تنتظر",
    not_found: "ما فيه خبر من شركة الشحن للحين",
    info_received: "المتجر سلّمها لشركة الشحن",
    in_transit: "في الطريق",
    out_for_delivery: "خرجت للتوصيل",
    pickup: "جاهزة للاستلام",
    delivered: "وصلت",
    failed: "ما قدروا يوصلونها",
    exception: "فيه مشكلة في الشحنة",
    expired: "ما فيه تحديث من فترة طويلة"
  },
  flags: { late: "متأخرة", stuck: "ما فيه خبر من أيام", problem: "مشكلة", no_info: "ما فيه معلومات للحين" },
  alerts: {
    delivered: "شحنتك وصلت",
    out_for_delivery: "شحنتك خرجت للتوصيل اليوم",
    pickup: "شحنتك جاهزة للاستلام",
    problem: "فيه مشكلة في شحنتك",
    late: "شحنتك متأخرة"
  },
  fromEmail: "من البريد",
  shareNumber: "شارك الرقم",
  rename: "غيّر الاسم",
  renamePh: "الاسم",
  hide: "شيلها من القائمة",
  hidden: "انشالت.",
  tracking: "التتبع (17TRACK)",
  trackingIntro: "Orbit يتابع الشحنات بحسابك المجاني في 17TRACK: حوالي ٣٠٠٠ شركة شحن، منها أرامكس وسمسا والبريد السعودي وJ&T وDHL. سوّ حساب، وانسخ مفتاح الـAPI من الإعدادات، والصقه هنا.",
  trackingKeyPh: "مفتاح 17TRACK",
  trackingConnect: "اربط 17TRACK",
  trackingConnecting: "أتأكد من المفتاح…",
  trackingLinked: "مربوط",
  trackingFix: "راجع المفتاح",
  trackingConnected: "17TRACK مربوط. كل رقم تتبع جديد ياخذ رصيد واحد من حسابك، والتحديث بعدها مجاني.",
  trackingCredits: (n: number) => `باقي لك ${digits(n)} رصيد تتبع هالسنة`,
  trackingOpenSite: "افتح 17TRACK",
  trackingDisconnect: "افصل 17TRACK",
  trackingUnlinkTitle: "تفصل 17TRACK؟",
  trackingUnlinkDetail: "Orbit ينسى المفتاح. الشحنات تبقى، بس توقف عن التحديث لين تربط مفتاح مرة ثانية.",
  trackingUnlinked: "انفصل 17TRACK.",
  trackingNeeded: "اربط 17TRACK تحت عشان يقدر Orbit يتابعها.",
  notif: "الشحنات",
  notifDetail: "إذا تأخرت، أو خرجت للتوصيل، أو وصلت. يتحدث لما تفتح Orbit."
};

export const sx = isArabic ? ar : en;
