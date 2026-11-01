import Constants, { ExecutionEnvironment } from "expo-constants";
import { DevSettings, I18nManager } from "react-native";

// The app's language is its layout direction: forceRTL survives restarts natively and
// can be read synchronously here, so strings and fonts are fixed before any style is built.
export const isArabic = I18nManager.isRTL;

const en = {
  today: "Today", plan: "Plan", momentum: "Momentum", more: "More", capture: "Capture", back: "Back", tasks: "Tasks", health: "Health", whoop: "WHOOP", food: "Food", finance: "Finance", people: "People", habits: "Habits", goals: "Goals", journal: "Journal", library: "Library", car: "Car", movies: "Movies & TV", servers: "Servers", settings: "Settings",
  nextPrayer: "Next prayer", digest: "Digest", attention: "Needs attention", nextUp: "Next up", healthToday: "Health today", customize: "Customize", quick: "Quick numbers",
  openTasks: "Open tasks", dueReminders: "Due reminders", focus: "Focus", mealsPlanned: "Meals planned", followUps: "Follow-ups", spentToday: "Spent today", activeGoals: "Active goals", habitsDone: "Habits done",
  overdue: "Overdue", dueToday: "Today", upcoming: "Upcoming", high: "High", low: "Low", normal: "Normal", done: "Done", complete: "Complete", reschedule: "Reschedule", snooze: "+1h", noDate: "No date",
  captureTitle: "Capture", capturePh: "spent 25 lunch · نمت 7 ساعات · call mom tomorrow 9am", preview: "Preview", recent: "Recent", save: "Save", saved: "Saved", cancel: "Cancel",
  week: "Week", review: "Review", trends: "Trends", morning: "Morning", evening: "Evening", weekly: "Weekly", readiness: "Readiness", dayMap: "Day map", recommended: "Recommended", upcoming7: "Next 7 days", workload: "Workload", healthGoals: "Health goals vs actual", moneyPlan: "Money plan", coverage: "Review coverage", wins: "Wins", gaps: "Gaps", handoff: "Tomorrow handoff", reflect: "Reflect", light: "Light", full: "Full", heavy: "Heavy", open: "Open", itemsOn: "items on",
  day: "Day", month: "Month", completion: "Completion", totalFocus: "Total focus", bestDay: "Best day", sessions: "Sessions", avgEnergy: "Avg energy", trend: "Focus minutes", planned: "Planned", missed: "Missed", recentSessions: "Recent sessions", finish: "Finish",
  pinned: "Pinned", editPins: "Edit", manageDay: "Manage the day", lifeLogs: "Life logs", homeServices: "Home & services", system: "System", pinsMax: "4 max",
  sortedByDue: "Sorted by due date", highPriority: "High priority", scheduled: "Reminders set",
  calories: "Calories", protein: "Protein", carbs: "Carbs", fat: "Fat", workouts7: "Workouts · 7d", avgSleep: "Avg sleep", weight: "Weight", meals: "Meals", workouts: "Workouts", sleep: "Sleep", quality: "Quality",
  recovery: "Recovery", rhr: "Resting HR", strain: "Strain", sleepPerf: "Sleep performance", recovery14: "Recovery · 14 days", good: "Good", mid: "Medium", poor: "Poor", aiSummary: "AI summary", regenerate: "Write a new summary", generating: "Writing… about a minute", connection: "Connection", lastSync: "Last sync", syncNow: "Sync now", disconnect: "Disconnect", keepData: "Keep data", deleteData: "Delete data", connect: "Connect", connectWhoop: "Connect WHOOP", whoopNotSetUp: "WHOOP isn't set up on the server yet.", connecting: "Connecting…", retry: "Retry",
  mealsToday: "Meals today", plannedCal: "Planned kcal", groceriesNeeded: "Groceries needed", mealPlans: "Meal plans", groceries: "Groceries", bought: "Bought", forMeal: "for",
  spentMonth: "Spent this month", monthlyBills: "Monthly bills", bills: "Bills", subscriptions: "Subscriptions", monthlyTotal: "Monthly total", renews: "renews", byCategory: "Spending by category", recentExpenses: "Recent expenses", autopay: "Autopay", markPaid: "Paid",
  dueFollowUps: "Due follow-ups", contacted: "Contacted", nextFollowUp: "Next follow-up", inAWeek: "In a week", inAMonth: "In a month", none: "None", birthdays: "Birthdays · 30 days", turns: "turns", everyone: "Everyone",
  streak: "streak", target: "Target", wroteToday: "Wrote today", mood7: "Mood · 7d", entries: "Entries", notYet: "Not yet", yes: "Yes",
  savedItems: "Saved", links: "Links", needsSorting: "Needs sorting", search: "Search links and notes", noTag: "No tag or note",
  registration: "Registration", insurance: "Insurance", inspection: "Inspection", oilChange: "Oil change", daysLeft: "days left", daysOverdue: "days overdue", notSet: "Not set", renewedToday: "Renewed today", enterDate: "Enter date", odometer: "Odometer", oilAt: "Oil due at", addCar: "Add a car", km: "km",
  seerrConnect: "Connect to Seerr", seerrHint: "URL and key are stored on this device only.", serverUrl: "Server URL", apiKey: "API key", trending: "Trending", results: "Results", request: "Request", requested: "Requested", available: "Available", watching: "Watching now", wantToWatch: "Want to watch", nextEp: "Next episode", nextSeason: "Next season", finished: "Finished", remove: "Remove", pending: "Awaiting my approval", approve: "Approve", decline: "Decline", searchMedia: "Search movies & TV", movie: "Movie", series: "TV",
  up: "Up", down: "Down", addServer: "Add server", serverName: "Name", checkedOnOpen: "Checked while the app is open", delete: "Delete", add: "Add",
  faceId: "Lock with Face ID", prayerAlerts: "Prayer alerts", prayerSource: "Umm al-Qura", language: "Language · اللغة", langLabel: "العربية", restartForLanguage: "Close and reopen Orbit to switch language.", languageNeedsBuild: "Switching language needs the installed app, not Expo Go.", signOut: "Sign out", signIn: "Sign in", signUp: "Create account", email: "Email", password: "Password", confirm: "Confirm password", nameOpt: "Name (optional)", noAccount: "No account?", haveAccount: "Have an account?", locked: "Orbit is locked", unlock: "Unlock with Face ID", signInFailed: "Sign in failed", signUpFailed: "Sign up failed", checkForm: "Check the form", tryAgain: "Try again.",
  loading: "Loading", offline: "Offline · showing saved data", error: "Couldn't reach the server", emptyEx: "Nothing here yet. Try:", min: "min", kcal: "kcal", couldNotAdd: "Could not add"
};

const ar: typeof en = {
  today: "اليوم", plan: "الخطة", momentum: "الزخم", more: "المزيد", capture: "تسجيل", back: "رجوع", tasks: "المهام", health: "الصحة", whoop: "WHOOP", food: "الأكل", finance: "الفلوس", people: "الناس", habits: "العادات", goals: "الأهداف", journal: "اليوميات", library: "المكتبة", car: "السيارة", movies: "أفلام ومسلسلات", servers: "السيرفرات", settings: "الإعدادات",
  nextPrayer: "الصلاة القادمة", digest: "الملخص", attention: "يحتاج انتباهك", nextUp: "القادم", healthToday: "صحة اليوم", customize: "تخصيص", quick: "أرقام سريعة",
  openTasks: "مهام مفتوحة", dueReminders: "تذكيرات مستحقة", focus: "تركيز", mealsPlanned: "وجبات مخططة", followUps: "متابعات", spentToday: "صرف اليوم", activeGoals: "أهداف نشطة", habitsDone: "عادات منجزة",
  overdue: "متأخرة", dueToday: "اليوم", upcoming: "قادمة", high: "عالية", low: "منخفضة", normal: "عادية", done: "تم", complete: "إنهاء", reschedule: "تأجيل", snooze: "+ساعة", noDate: "بدون موعد",
  captureTitle: "تسجيل سريع", capturePh: "صرفت 25 غداء · slept 7h · اتصل بأمي بكرة 9", preview: "المعاينة", recent: "الأخيرة", save: "حفظ", saved: "تم الحفظ", cancel: "إلغاء",
  week: "الأسبوع", review: "المراجعة", trends: "الاتجاهات", morning: "صباح", evening: "مساء", weekly: "أسبوعي", readiness: "الجاهزية", dayMap: "خريطة الأيام", recommended: "إجراءات موصى بها", upcoming7: "خلال ٧ أيام", workload: "ضغط العمل", healthGoals: "أهداف الصحة مقابل الفعلي", moneyPlan: "خطة الفلوس", coverage: "تغطية المراجعة", wins: "الإنجازات", gaps: "النواقص", handoff: "تسليم الغد", reflect: "تأمل", light: "خفيف", full: "ممتلئ", heavy: "ثقيل", open: "فتح", itemsOn: "عناصر في",
  day: "يوم", month: "شهر", completion: "الإكمال", totalFocus: "إجمالي التركيز", bestDay: "أفضل يوم", sessions: "الجلسات", avgEnergy: "متوسط الطاقة", trend: "دقائق التركيز", planned: "المخططة", missed: "فائتة", recentSessions: "آخر الجلسات", finish: "إنهاء",
  pinned: "المثبّتة", editPins: "تعديل", manageDay: "إدارة اليوم", lifeLogs: "سجلات الحياة", homeServices: "البيت والخدمات", system: "النظام", pinsMax: "٤ كحد أقصى",
  sortedByDue: "مرتبة حسب الموعد", highPriority: "أولوية عالية", scheduled: "تذكيرات مجدولة",
  calories: "السعرات", protein: "البروتين", carbs: "الكربوهيدرات", fat: "الدهون", workouts7: "تمرين · ٧ أيام", avgSleep: "متوسط النوم", weight: "الوزن", meals: "الوجبات", workouts: "التمارين", sleep: "النوم", quality: "الجودة",
  recovery: "الاستشفاء", rhr: "نبض الراحة", strain: "الإجهاد", sleepPerf: "أداء النوم", recovery14: "الاستشفاء · ١٤ يومًا", good: "جيد", mid: "متوسط", poor: "ضعيف", aiSummary: "ملخص الذكاء الاصطناعي", regenerate: "اكتب ملخصًا جديدًا", generating: "جارٍ الكتابة… قرابة دقيقة", connection: "الاتصال", lastSync: "آخر مزامنة", syncNow: "مزامنة الآن", disconnect: "فصل", keepData: "احتفظ بالبيانات", deleteData: "احذف البيانات", connect: "ربط", connectWhoop: "اربط WHOOP", whoopNotSetUp: "WHOOP غير مفعّل في السيرفر بعد.", connecting: "جارٍ الربط…", retry: "إعادة المحاولة",
  mealsToday: "وجبات اليوم", plannedCal: "سعرات مخططة", groceriesNeeded: "مشتريات مطلوبة", mealPlans: "خطط الوجبات", groceries: "المشتريات", bought: "تم الشراء", forMeal: "لـ",
  spentMonth: "صرف الشهر", monthlyBills: "فواتير شهرية", bills: "الفواتير", subscriptions: "الاشتراكات", monthlyTotal: "الإجمالي الشهري", renews: "يتجدد", byCategory: "الصرف حسب الفئة", recentExpenses: "آخر المصروفات", autopay: "دفع تلقائي", markPaid: "دفعت",
  dueFollowUps: "متابعات مستحقة", contacted: "تواصلت", nextFollowUp: "المتابعة التالية", inAWeek: "بعد أسبوع", inAMonth: "بعد شهر", none: "بدون", birthdays: "أعياد الميلاد · ٣٠ يومًا", turns: "يكمل", everyone: "الكل",
  streak: "سلسلة", target: "الموعد", wroteToday: "كتبت اليوم", mood7: "المزاج · ٧ أيام", entries: "التدوينات", notYet: "ليس بعد", yes: "نعم",
  savedItems: "المحفوظات", links: "الروابط", needsSorting: "يحتاج ترتيب", search: "ابحث في الروابط والملاحظات", noTag: "بدون وسم أو ملاحظة",
  registration: "الاستمارة", insurance: "التأمين", inspection: "الفحص", oilChange: "تغيير الزيت", daysLeft: "يوم متبقٍ", daysOverdue: "يوم تأخير", notSet: "غير محدد", renewedToday: "جددت اليوم", enterDate: "إدخال تاريخ", odometer: "العداد", oilAt: "الزيت عند", addCar: "إضافة سيارة", km: "كم",
  seerrConnect: "الربط بسيرفر Seerr", seerrHint: "الرابط والمفتاح يُحفظان على الجهاز فقط.", serverUrl: "رابط السيرفر", apiKey: "مفتاح API", trending: "رائج", results: "النتائج", request: "اطلب", requested: "مطلوب", available: "متوفر", watching: "أشاهده الآن", wantToWatch: "أريد مشاهدته", nextEp: "الحلقة التالية", nextSeason: "الموسم التالي", finished: "انتهيت", remove: "حذف", pending: "تنتظر موافقتي", approve: "موافقة", decline: "رفض", searchMedia: "ابحث عن فيلم أو مسلسل", movie: "فيلم", series: "مسلسل",
  up: "يعمل", down: "متوقف", addServer: "إضافة سيرفر", serverName: "الاسم", checkedOnOpen: "يُفحص أثناء فتح التطبيق", delete: "حذف", add: "إضافة",
  faceId: "القفل بـ Face ID", prayerAlerts: "تنبيهات الصلاة", prayerSource: "أم القرى", language: "Language · اللغة", langLabel: "English", restartForLanguage: "أغلق Orbit وافتحه لتبديل اللغة.", languageNeedsBuild: "تبديل اللغة يحتاج التطبيق المثبّت، لا Expo Go.", signOut: "تسجيل الخروج", signIn: "تسجيل الدخول", signUp: "إنشاء حساب", email: "البريد", password: "كلمة المرور", confirm: "تأكيد كلمة المرور", nameOpt: "الاسم (اختياري)", noAccount: "ما عندك حساب؟", haveAccount: "عندك حساب؟", locked: "Orbit مقفل", unlock: "افتح بـ Face ID", signInFailed: "تعذر تسجيل الدخول", signUpFailed: "تعذر إنشاء الحساب", checkForm: "راجع البيانات", tryAgain: "حاول مرة أخرى.",
  loading: "جارٍ التحميل", offline: "بدون إنترنت · بيانات محفوظة", error: "تعذر الوصول للسيرفر", emptyEx: "لا شيء هنا بعد. جرّب:", min: "د", kcal: "سعرة", couldNotAdd: "تعذرت الإضافة"
};

export const t = isArabic ? ar : en;

// Tap to start a line with the right word; the parser does the rest.
export const captureStarters = isArabic ? ["صرفت ", "نمت ", "تمرين ", "وزني ", "اشتري ", "ملاحظة "] : ["spent ", "slept ", "workout ", "weight ", "buy ", "note "];

// Gregorian in both languages; Arabic keeps Arabic digits.
const locale = isArabic ? "ar-SA-u-ca-gregory" : "en-GB";

export function formatDate(value: string | number | Date, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  // en-GB for day-before-month, but clocks read 2:58 PM as in the design.
  return new Intl.DateTimeFormat(locale, options.hour ? { hour12: true, ...options } : options).format(new Date(value)).replace(/\b(am|pm)\b/, (period) => period.toUpperCase());
}

/** "in 42 min" / "بعد ٤٢ دقيقة". */
export function formatIn(minutes: number) {
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (isArabic) return `بعد ${hours ? `${number(hours)} س ` : ""}${number(rest)} دقيقة`;
  return `in ${hours ? `${hours}h ` : ""}${rest} min`;
}

export const formatClock = (value: string | number | Date) => formatDate(value, { hour: "numeric", minute: "2-digit" });

/**
 * Flips the layout and reloads. ponytail: no expo-updates, so a release build asks for a manual restart.
 * Expo Go resets the direction from app.json on every load, so the switch only works in an installed build.
 */
export function toggleLanguage(): string | null {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return t.languageNeedsBuild;
  I18nManager.allowRTL(!isArabic);
  I18nManager.forceRTL(!isArabic);
  if (__DEV__) {
    DevSettings.reload();
    return null;
  }
  return t.restartForLanguage;
}
