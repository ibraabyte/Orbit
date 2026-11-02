# تسليم: الدخول من Google — 2026-11-02

القرار في [decisions/2026-11-02-google-sign-in.md](../decisions/2026-11-02-google-sign-in.md).

## المنجز (غير ملتزم به على `main`)

- الخادم: `app/services/google_api.py`، ومسارات `/auth/google/start` و`callback` و`finish` في `routers/auth.py`، وحقل `google` في `/auth/status`، والترحيل `0006` (يأتي بعد `0005` غير الملتزم به).
- التطبيق: زر "المتابعة مع Google" في `src/app/sign-in.tsx`، يظهر فقط إذا كان الخادم مهيأ. `signupsOpen()` في `api.ts` صار `authStatus()`.
- التوثيق: خطوات الإعداد في `backend/README.md`، والمتغيرات في `DEPLOY.md` و`docker-compose.yml` و`.env.example`.

## الفحص

- `pytest`: نجح 189 اختبارًا، منها 10 جديدة في `tests/test_google_auth.py` بخادم Google وهمي. `ruff check`: نظيف.
- `npm run verify`: نجح 211 اختبارًا مع `tsc`، وأُعيد في نهاية الجلسة بنفس النتيجة.
- طلب حقيقي لـ`/auth/google/start` بعميل وهمي: الرابط يذهب إلى `accounts.google.com` بالقيم الصحيحة.

## الناقص

- **لم يُجرَّب مع Google الحقيقي**، لأن الحساب في Google Cloud غير موجود بعد.
- **لم يُشاهد الزر على الشاشة**. المحاكي الأول كانت تستخدمه جلسة "تنظيف التصميم"، والمحاكي الثاني احتاج موافقة لم تُمنح.
- `/auth/delete-account` و`/auth/password` يطلبان كلمة مرور، فحساب Google فقط لا يقدر يستخدمهما. لا توجد لهما شاشة في التطبيق حاليًا، لكن App Store يشترط حذف الحساب.
- App Store يشترط غالبًا خيارًا مثل Sign in with Apple مع Google. لا يهم في نشر Ad Hoc الحالي.

## ملاحظة

- `.env.development.local` يغلب متغير البيئة في Metro؛ للتجربة على خادم آخر استخدم `EXPO_NO_DOTENV=1`.
- جلسة "تنظيف التصميم" كانت تعدل `theme.ts` وملفات الواجهة بالتزامن. لون وحدود الزر تأتي من `colors.field` و`colors.hairline` و`colors.ink`.

## الخطوة التالية

إنشاء عميل Google حسب `backend/README.md`، ثم وضع القيم في Coolify، ثم النشر، وتجربة الدخول على الهاتف.
