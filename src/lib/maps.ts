import type { ApiClient } from "@/lib/api";
import { digits, formatClock, isArabic } from "@/lib/i18n";
import type { Task } from "@/lib/types";

// Leave-time alerts live on Orbit's own server (backend/app/routers/maps.py), with the person's own Google Maps key:
// a place on a task, the way there from where the phone is, and when to leave. Shapes mirror its JSON.

export type TravelMode = "drive" | "walk" | "transit";
export const TRAVEL_MODES: TravelMode[] = ["drive", "walk", "transit"];
export const BUFFERS = [0, 5, 10, 15, 20, 30] as const;

export type MapsStatus = { connected: boolean; connected_at: string | null };
export type Position = { lat: number; lng: number };
export type PlaceResult = { id: string; name: string; address: string | null };
export type LeaveStatus = "ok" | "late" | "no_route";
export type LeaveTime = {
  task_id: string;
  title: string;
  place_name: string;
  due_at: string;
  travel_minutes: number | null;
  meters: number | null;
  leave_at: string | null;
  status: LeaveStatus;
};
export type LeaveReply = { mode: TravelMode; buffer_minutes: number; checked_at: string; items: LeaveTime[] };

/** How the person travels and how many minutes to spare. Kept on the phone (orbit.travel). */
export type TravelPrefs = { mode: TravelMode; buffer: number };
export const TRAVEL_DEFAULT: TravelPrefs = { mode: "drive", buffer: 10 };
export const TRAVEL_KEY = "orbit.travel";

export function parseTravelPrefs(raw: string | null): TravelPrefs {
  try {
    const value = JSON.parse(raw ?? "null") as Partial<TravelPrefs> | null;
    return {
      mode: value && TRAVEL_MODES.includes(value.mode as TravelMode) ? (value.mode as TravelMode) : TRAVEL_DEFAULT.mode,
      buffer: value && (BUFFERS as readonly number[]).includes(value.buffer as number) ? (value.buffer as number) : TRAVEL_DEFAULT.buffer
    };
  } catch {
    return TRAVEL_DEFAULT;
  }
}

type Api = Pick<ApiClient, "get" | "post" | "put" | "delete">;
const locale = () => (isArabic ? "ar" : "en");

export const mapsApi = {
  status: (api: Api) => api.get<MapsStatus>("/maps"),
  connect: (api: Api, apiKey: string) => api.put<MapsStatus>("/maps/key", { api_key: apiKey.trim() }),
  disconnect: (api: Api) => api.delete("/maps/key"),
  places: (api: Api, query: string, near: Position | null) => api.post<PlaceResult[]>("/maps/places", { query: query.trim(), near, locale: locale() }),
  leave: (api: Api, origin: Position, prefs: TravelPrefs) => api.post<LeaveReply>("/maps/leave", { origin, mode: prefs.mode, buffer_minutes: prefs.buffer, locale: locale() })
};

export const MAPS_KEY_URL = "https://console.cloud.google.com/google/maps-apis/credentials";

/** The open tasks the server would time: a place, and a due time in the next `hours`. */
export function tasksToTime(tasks: Task[], now: Date, hours = 24): Task[] {
  const until = now.getTime() + hours * 3_600_000;
  return tasks.filter((task) => {
    if (task.status !== "open" || !task.place_name || !task.due_at) return false;
    const due = new Date(task.due_at);
    return due.getTime() > now.getTime() && due.getTime() <= until && (due.getHours() !== 0 || due.getMinutes() !== 0);
  });
}

// once: the same for every estimate of one appointment, so "leave now" is not sent twice for it.
export type LeaveAlert = { id: string; once: string; at: Date | null; title: string; body: string; taskId: string };

/** What to schedule: one alert at the time to leave, or one now when that time has already passed. */
export function leaveAlerts(items: LeaveTime[], now: Date): LeaveAlert[] {
  return items.flatMap((item) => {
    if (item.status === "no_route" || !item.leave_at || item.travel_minutes === null) return [];
    const at = new Date(item.leave_at);
    const due = new Date(item.due_at);
    if (due.getTime() <= now.getTime()) return [];
    const late = at.getTime() <= now.getTime();
    const body = mx.alertBody(item.place_name, mx.minutes(item.travel_minutes), formatClock(item.due_at));
    // The id changes with the leave time, so a new estimate replaces the old alert instead of adding one.
    return [{ id: `leave-${item.task_id}-${at.getTime()}`, once: `${item.task_id}@${due.getTime()}`, at: late ? null : at, title: late ? mx.alertLate(item.title) : mx.alertTitle(item.title), body, taskId: item.task_id }];
  });
}

/** "Leave 3:20 PM · 35 min by car", for lists. */
export function leaveLine(item: LeaveTime): string {
  if (item.status === "no_route" || !item.leave_at || item.travel_minutes === null) return mx.noRoute;
  const way = mx.minutes(item.travel_minutes);
  return item.status === "late" ? `${mx.leaveNow} · ${way}` : `${mx.leaveAt(formatClock(item.leave_at))} · ${way}`;
}

const en = {
  maps: "Google Maps",
  rowDetail: "When to leave for your appointments, with traffic",
  intro:
    "Orbit times the way to each appointment that has a place, from where your phone is, with the traffic expected, and alerts you when it is time to leave. It uses your own Google Maps Platform key.",
  steps:
    "In the Google Cloud console: make a project with billing on, turn on the Routes API and the Places API (New), then make an API key under Keys & Credentials and paste it here.",
  keyPh: "Google Maps API key",
  connect: "Link Google Maps",
  connecting: "Checking the key…",
  linked: "Linked",
  connected: "Google Maps is linked. Add a place to an appointment and Orbit tells you when to leave.",
  openConsole: "Open the Google Cloud console",
  disconnect: "Unlink Google Maps",
  unlinkTitle: "Unlink Google Maps?",
  unlinkDetail: "Orbit forgets the key. Places on your tasks stay, but leave-time alerts stop.",
  unlinked: "Google Maps unlinked.",
  privacy: "When Orbit times the way, your phone's position goes through Orbit's server to Google. It is not kept.",
  travel: "How you get there",
  modes: { drive: "By car", walk: "Walking", transit: "Public transport" } as Record<TravelMode, string>,
  buffer: "Time to spare",
  bufferNames: (n: number) => (n === 0 ? "None" : `${digits(n)} min`),
  coming: "Coming appointments",
  nothing: "No appointment with a place in the next day. Add a place to a task with a time.",
  needsLocation: "Allow location for Orbit to time the way from where you are.",
  check: "Check now",
  checking: "Timing…",
  // On a task
  place: "Place",
  placePh: "Where? A name or an address",
  search: "Search",
  searching: "Searching…",
  noResults: "Nothing found. You can keep what you typed.",
  clearPlace: "Remove place",
  pickedOnMaps: "Picked on Google Maps",
  linkForSearch: "Link Google Maps to search places and get an alert when it is time to leave.",
  placeHint: "With a time and a place, Orbit tells you when to leave.",
  // Lines and alerts
  minutes: (n: number) => (n >= 60 ? `${digits(Math.floor(n / 60))} h ${n % 60 ? `${digits(n % 60)} min` : ""}`.trim() : `${digits(n)} min`),
  leaveAt: (time: string) => `Leave ${time}`,
  leaveNow: "Leave now",
  noRoute: "Google found no way there",
  alertTitle: (title: string) => `Time to leave: ${title}`,
  alertLate: (title: string) => `Leave now to make it: ${title}`,
  alertBody: (place: string, way: string, due: string) => `${place} · ${way} on the way · due ${due}`,
  notif: "Time to leave",
  notifDetail: "For appointments with a place. Timed when you open Orbit."
};

const ar: typeof en = {
  maps: "خرائط قوقل",
  rowDetail: "متى تطلع لمواعيدك، مع حساب الزحمة",
  intro: "يحسب Orbit وقت الطريق لكل موعد له مكان، من مكان جوالك ومع الزحمة المتوقعة، وينبهك إذا جا وقت الطلعة. يستخدم مفتاحك الخاص من Google Maps Platform.",
  steps: "في Google Cloud console: سوّ مشروع وفعّل فيه الفوترة، وشغّل Routes API وPlaces API (New)، وبعدين سوّ مفتاح من Keys & Credentials والصقه هنا.",
  keyPh: "مفتاح Google Maps",
  connect: "اربط خرائط قوقل",
  connecting: "أتأكد من المفتاح…",
  linked: "مربوط",
  connected: "خرائط قوقل مربوطة. أضف مكان لأي موعد ويقول لك Orbit متى تطلع.",
  openConsole: "افتح Google Cloud console",
  disconnect: "افصل خرائط قوقل",
  unlinkTitle: "تفصل خرائط قوقل؟",
  unlinkDetail: "ينسى Orbit المفتاح. الأماكن اللي في مهامك تبقى، بس تنبيهات وقت الطلعة توقف.",
  unlinked: "انفصلت خرائط قوقل.",
  privacy: "لما يحسب Orbit الطريق، يروح موقع جوالك عن طريق خادم Orbit إلى قوقل. ما ينحفظ.",
  travel: "وش تروح فيه",
  modes: { drive: "بالسيارة", walk: "مشي", transit: "مواصلات عامة" },
  buffer: "وقت احتياط",
  bufferNames: (n: number) => (n === 0 ? "بدون" : `${digits(n)} د`),
  coming: "المواعيد الجاية",
  nothing: "ما فيه موعد له مكان خلال اليوم الجاي. أضف مكان لمهمة لها وقت.",
  needsLocation: "اسمح لـOrbit يعرف موقعك عشان يحسب الطريق من مكانك.",
  check: "احسب الحين",
  checking: "أحسب…",
  place: "المكان",
  placePh: "وين؟ اسم المكان أو العنوان",
  search: "ابحث",
  searching: "أدوّر…",
  noResults: "ما لقيت شي. تقدر تخلي اللي كتبته.",
  clearPlace: "شيل المكان",
  pickedOnMaps: "مختار من خرائط قوقل",
  linkForSearch: "اربط خرائط قوقل عشان تبحث عن الأماكن وينبهك إذا جا وقت الطلعة.",
  placeHint: "إذا للموعد وقت ومكان، يقول لك Orbit متى تطلع.",
  minutes: (n: number) => (n >= 60 ? `${digits(Math.floor(n / 60))} س ${n % 60 ? `${digits(n % 60)} د` : ""}`.trim() : `${digits(n)} د`),
  leaveAt: (time: string) => `اطلع ${time}`,
  leaveNow: "اطلع الحين",
  noRoute: "قوقل ما لقى طريق للمكان",
  alertTitle: (title: string) => `جا وقت الطلعة: ${title}`,
  alertLate: (title: string) => `اطلع الحين عشان تلحق: ${title}`,
  alertBody: (place: string, way: string, due: string) => `${place} · الطريق ${way} · الموعد ${due}`,
  notif: "وقت الطلعة",
  notifDetail: "للمواعيد اللي لها مكان. ينحسب لما تفتح Orbit."
};

export const mx = isArabic ? ar : en;
