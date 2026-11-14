import type { ApiClient } from "@/lib/api";
import { formatDate, isArabic } from "@/lib/i18n";

// Calls the agent makes for you (booking an appointment). Shapes mirror backend/app/routers/calls.py.
// Nothing rings until you approve the plan; the server talks on the phone with your own Twilio account and OpenAI key.

export type CallStatus = "draft" | "calling" | "in_progress" | "ended" | "failed" | "canceled";
export type CallOutcome = "booked" | "not_booked" | "needs_you" | "no_answer";
export type TranscriptLine = { who: "agent" | "them"; text: string };

export type PhoneCall = {
  id: string;
  business_name: string;
  to_number: string;
  request: string;
  goal: string;
  disclosure: string;
  opening: string;
  allowed: string | null;
  caller_name: string | null;
  status: CallStatus;
  outcome: CallOutcome | null;
  appointment_at: string | null;
  summary: string | null;
  transcript: TranscriptLine[];
  error: string | null;
  task_id: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
};

export type PhoneSetup = {
  connected: boolean;
  account_hint: string | null;
  from_number: string | null;
  voice: string;
  openai: boolean;
  ready: boolean;
  voices: string[];
};

export type SetupInput = { accountSid: string; authToken: string; fromNumber: string; voice: string };
export type PlanChanges = Partial<Pick<PhoneCall, "business_name" | "to_number" | "goal" | "opening" | "allowed" | "caller_name">>;

type Api = Pick<ApiClient, "get" | "post" | "put" | "patch" | "delete">;
const path = (id: string) => `/calls/${encodeURIComponent(id)}`;

export const callsApi = {
  setup: (api: Api) => api.get<PhoneSetup>("/calls/setup"),
  // No auth_token means "keep the saved one".
  saveSetup: (api: Api, { accountSid, authToken, fromNumber, voice }: SetupInput) =>
    api.put<PhoneSetup>("/calls/setup", { account_sid: accountSid.trim(), from_number: fromNumber.trim(), voice, ...(authToken.trim() ? { auth_token: authToken.trim() } : {}) }),
  removeSetup: (api: Api) => api.delete("/calls/setup"),
  list: (api: Api) => api.get<PhoneCall[]>("/calls"),
  get: (api: Api, id: string) => api.get<PhoneCall>(path(id)),
  plan: (api: Api, request: string, businessName: string, toNumber: string) =>
    api.post<PhoneCall>("/calls", { request: request.trim(), business_name: businessName.trim(), to_number: toNumber.trim() }),
  change: (api: Api, id: string, changes: PlanChanges) => api.patch<PhoneCall>(path(id), changes),
  start: (api: Api, id: string) => api.post<PhoneCall>(`${path(id)}/start`),
  hangUp: (api: Api, id: string) => api.post<PhoneCall>(`${path(id)}/hang-up`),
  remove: (api: Api, id: string) => api.delete(path(id))
};

// Same rule as the server: +country code, or a Saudi mobile written 05XXXXXXXX.
export function normalizePhone(value: string): string {
  let number = value.replace(/[\s\-().]/g, "");
  // Arabic-Indic digits typed on an Arabic keyboard.
  number = number.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  if (number.startsWith("00")) number = `+${number.slice(2)}`;
  if (/^05\d{8}$/.test(number)) number = `+966${number.slice(1)}`;
  return number;
}

export const phoneValid = (value: string) => /^\+[1-9]\d{7,14}$/.test(normalizePhone(value));

export const isActive = (call: Pick<PhoneCall, "status">) => call.status === "calling" || call.status === "in_progress";
export const sidValid = (value: string) => /^AC[0-9a-fA-F]{32}$/.test(value.trim());

export function setupReady(form: SetupInput, saved: PhoneSetup | null) {
  const tokenOk = Boolean(form.authToken.trim()) || Boolean(saved?.connected);
  return sidValid(form.accountSid) && phoneValid(form.fromNumber) && tokenOk;
}

// The badge a call shows: its outcome once over, else where it is.
export type CallBadge = { label: string; tone: "neutral" | "success" | "accent" | "urgent" };

export function callBadge(call: Pick<PhoneCall, "status" | "outcome">): CallBadge {
  if (call.status === "draft") return { label: px.states.draft, tone: "neutral" };
  if (call.status === "calling") return { label: px.states.calling, tone: "accent" };
  if (call.status === "in_progress") return { label: px.states.in_progress, tone: "accent" };
  if (call.status === "failed") return { label: px.states.failed, tone: "urgent" };
  if (call.status === "canceled") return { label: px.states.canceled, tone: "neutral" };
  if (call.outcome === "booked") return { label: px.outcomes.booked, tone: "success" };
  if (call.outcome) return { label: px.outcomes[call.outcome], tone: call.outcome === "needs_you" ? "accent" : "neutral" };
  return { label: px.states.ended, tone: "neutral" };
}

export const appointmentText = (iso: string) => formatDate(iso, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

const en = {
  calls: "Calls for me",
  callsDetail: "The agent phones a shop and books for you",
  newCall: "New call",
  request: "What should it do?",
  requestPh: "Book me a haircut tomorrow afternoon",
  business: "Who to call (optional)",
  businessPh: "e.g. Barber",
  number: "Their number",
  numberPh: "05XXXXXXXX",
  numberBad: "Write the number like 05XXXXXXXX or with its country code.",
  prepare: "Prepare the call",
  preparing: "Preparing the plan…",
  planTitle: "Check before it calls",
  planIntro: "Nothing rings until you approve. You can change any line.",
  firstWords: "First words (always)",
  goal: "Goal",
  opening: "Then it says",
  allowed: "It may agree to",
  allowedPh: "e.g. Sunday between 3 and 6 PM",
  allowedNone: "Nothing beyond the goal",
  name: "Name it gives",
  namePh: "Your name",
  calling: "Calling",
  rules: "It always says it's an automated assistant. It never pays, agrees to a deposit, or gives card, ID or address details. If they offer something else, it asks you.",
  cost: "Your Twilio and OpenAI accounts are charged per minute. A call stops after 5 minutes.",
  approve: "Approve and call",
  starting: "Calling…",
  hangUp: "Hang up",
  deleteCall: "Delete",
  deleteTitle: "Delete this call?",
  deleteBody: "Its plan and transcript go. A task made from it stays.",
  result: "Result",
  appointment: "Appointment",
  addedToTask: "Added to your tasks",
  openTask: "Open task",
  transcript: "What was said",
  agent: "Agent",
  them: "Them",
  noTranscript: "Nothing was said.",
  live: "The call is on. This page updates by itself.",
  duration: (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`,
  past: "Past calls",
  empty: "No calls yet. Tell the agent what to book:",
  emptyExample: "Book me a haircut tomorrow afternoon",
  setup: "Phone setup",
  setupIntro: "Calls go out through your own Twilio account. Orbit keeps the auth token encrypted on its server, for your account only.",
  setupNotReady: "Set up Twilio below before the first call.",
  needOpenai: "The agent's voice uses your own OpenAI key. Add it under Integrations, as an AI or as the voice model.",
  openIntegrations: "Open Integrations",
  accountSid: "Account SID (AC…)",
  authToken: "Auth token",
  tokenSaved: "Auth token (saved, type to replace)",
  fromNumber: "Calls come from (your verified mobile)",
  fromHint: "Your own mobile, verified in Twilio under Phone Numbers > Verified Caller IDs, or a number you bought there.",
  voice: "Voice",
  saveSetup: "Save",
  savingSetup: "Checking with Twilio…",
  removeSetup: "Remove Twilio",
  removeTitle: "Remove Twilio?",
  removeBody: "Orbit forgets the account and token. Past calls stay.",
  connected: "Connected",
  notConnected: "Not set up",
  states: { draft: "Waiting for you", calling: "Ringing", in_progress: "On the call", ended: "Ended", failed: "Failed", canceled: "Stopped" } as Record<CallStatus, string>,
  outcomes: { booked: "Booked", not_booked: "Not booked", needs_you: "Needs you", no_answer: "No answer" } as Record<CallOutcome, string>
};

const ar: typeof en = {
  calls: "مكالمات عنّي",
  callsDetail: "الوكيل يتصل بالمحل ويحجز لك",
  newCall: "مكالمة جديدة",
  request: "وش تبيه يسوي؟",
  requestPh: "احجز لي موعد حلاق بكرا العصر",
  business: "مين يتصل عليه (اختياري)",
  businessPh: "مثل: الحلاق",
  number: "رقمهم",
  numberPh: "05XXXXXXXX",
  numberBad: "اكتب الرقم مثل 05XXXXXXXX أو مع رمز الدولة.",
  prepare: "جهّز المكالمة",
  preparing: "أجهّز الخطة…",
  planTitle: "راجع قبل ما يتصل",
  planIntro: "ما يتصل إلا بعد موافقتك. تقدر تعدّل أي سطر.",
  firstWords: "أول كلامه (ثابت)",
  goal: "الهدف",
  opening: "بعدها يقول",
  allowed: "يقدر يوافق على",
  allowedPh: "مثل: الأحد بين ٣ و٦ العصر",
  allowedNone: "ولا شي غير الهدف",
  name: "الاسم اللي يعطيه",
  namePh: "اسمك",
  calling: "يتصل على",
  rules: "دايم يقول إنه مساعد آلي. ما يدفع، ولا يوافق على عربون، ولا يعطي بطاقة أو هوية أو عنوان. إذا عرضوا شي ثاني يرجع لك.",
  cost: "تنحسب الدقايق من حسابك في Twilio وOpenAI. المكالمة تنقطع بعد ٥ دقايق.",
  approve: "وافق واتصل",
  starting: "يتصل…",
  hangUp: "سكّر المكالمة",
  deleteCall: "حذف",
  deleteTitle: "تحذف المكالمة؟",
  deleteBody: "تنحذف الخطة والكلام. المهمة اللي انضافت منها تبقى.",
  result: "النتيجة",
  appointment: "الموعد",
  addedToTask: "انضاف لمهامك",
  openTask: "افتح المهمة",
  transcript: "وش انقال",
  agent: "الوكيل",
  them: "هم",
  noTranscript: "ما انقال شي.",
  live: "المكالمة شغالة. الصفحة تتحدّث لحالها.",
  duration: en.duration,
  past: "المكالمات السابقة",
  empty: "ما فيه مكالمات. قل للوكيل وش يحجز:",
  emptyExample: "احجز لي موعد حلاق بكرا العصر",
  setup: "إعداد الاتصال",
  setupIntro: "المكالمات تطلع من حسابك في Twilio. يحفظ Orbit رمز الدخول مشفّر في الخادم، لحسابك بس.",
  setupNotReady: "جهّز Twilio تحت قبل أول مكالمة.",
  needOpenai: "صوت الوكيل يستخدم مفتاح OpenAI حقك. أضفه في التكاملات، كذكاء أو كنموذج صوت.",
  openIntegrations: "افتح التكاملات",
  accountSid: "رقم الحساب (AC…)",
  authToken: "رمز الدخول",
  tokenSaved: "رمز الدخول (محفوظ، اكتب لتغييره)",
  fromNumber: "يتصل من (جوالك الموثّق)",
  fromHint: "جوالك الموثّق في Twilio من Phone Numbers ثم Verified Caller IDs، أو رقم شريته منهم.",
  voice: "الصوت",
  saveSetup: "حفظ",
  savingSetup: "أتأكد مع Twilio…",
  removeSetup: "إزالة Twilio",
  removeTitle: "تزيل Twilio؟",
  removeBody: "ينسى Orbit الحساب والرمز. المكالمات السابقة تبقى.",
  connected: "متصل",
  notConnected: "غير مجهّز",
  states: { draft: "تنتظرك", calling: "يرن", in_progress: "في المكالمة", ended: "انتهت", failed: "ما نجحت", canceled: "توقفت" },
  outcomes: { booked: "انحجز", not_booked: "ما انحجز", needs_you: "يحتاجك", no_answer: "ما ردّوا" }
};

export const px = isArabic ? ar : en;
