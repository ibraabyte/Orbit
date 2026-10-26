# Orbit: خريطة الكود والبنية

هذه الخريطة من نسخة Git المحلية عند `ae1dddb0cf4fe862ce3dd21afae1118113f21e6e`.

```text
Expo Router -> جلسة Supabase وقفل التطبيق
  -> مزوّد بيانات اللوحة -> استعلامات وأفعال Supabase
  -> شاشات React Native والمنطق المشترك
```

| المجال | موضعه |
| --- | --- |
| الجلسة ومسارات التطبيق | src/app/_layout.tsx (`../../src/app/_layout.tsx`، مسار من عينة العمل المحلية وليس من قاعدة هذا الفرع) |
| شاشات الشريط السفلي | src/app/(tabs)/ (`../../src/app/(tabs)/`، مسار من عينة العمل المحلية وليس من قاعدة هذا الفرع) |
| الإعدادات وتسجيل الدخول | src/app/settings.tsx (`../../src/app/settings.tsx`، مسار من عينة العمل المحلية وليس من قاعدة هذا الفرع)، src/app/sign-in.tsx (`../../src/app/sign-in.tsx`، مسار من عينة العمل المحلية وليس من قاعدة هذا الفرع) |
| البيانات المشتركة للشاشات | src/hooks/use-dashboard-data.tsx (`../../src/hooks/use-dashboard-data.tsx`، مسار من عينة العمل المحلية وليس من قاعدة هذا الفرع) |
| العميل وحفظ الجلسة | [src/lib/supabase.ts](../../src/lib/supabase.ts) |
| قفل التطبيق المحلي | src/components/app-lock.tsx (`../../src/components/app-lock.tsx`، مسار من عينة العمل المحلية وليس من قاعدة هذا الفرع) |
| منطق المجالات | [src/lib/](../../src/lib/) |
| مخطط قاعدة البيانات وسياسات الصفوف | [supabase/migrations/](../../supabase/migrations/) |
| اختبارات المنطق وأوامرها | [src/lib/__tests__/](../../src/lib/__tests__/)، [package.json](../../package.json) |
| تجميع ملفات SQL | [scripts/migration-bundle.mjs](../../scripts/migration-bundle.mjs) |

مزوّد البيانات يحمّل سجلات المستخدم حسب `user_id`، ثم يعيد التحميل بعد الكتابة.
الكود يصرّح بأن ذاكرة البيانات للعمل دون اتصال غير مضافة بعد؛ لا تنقل ادعاءات offline في وثائق الويب القديمة إلى Expo.
وجود مرشّح في العميل أو ملفات سياسات لا يثبت مراجعة أمان أو تطبيق السياسات على قاعدة حية.

## التحقق

`package.json` يعرّف `npm run typecheck` و`npm test` و`npm run verify`.
إعدادات Vitest عند مرجع الفحص تثبّت منطقة الوقت `Asia/Riyadh` لاختبارات منطق التاريخ.
لوحظ تغيير اسم ملف إعداد Vitest أثناء عمل متزامن؛ افحص الحالة الحالية بدل اعتماد الاسم القديم.
لم تُنفّذ هذه الاختبارات أو أي ترحيل SQL ضمن فحص حقائق الذاكرة.
