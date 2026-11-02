# تسليم: تجهيز نشر Ad Hoc — 2026-11-01

القرار في [decisions/2026-11-01-adhoc-release.md](../decisions/2026-11-01-adhoc-release.md).

## المنجز (غير ملتزم به على `main`)

- ثُبت `expo-updates`، وأضيف `eas.json`، وعُدل `app.json` (`updates.url` و`runtimeVersion` و`owner` و`projectId`).
- أنشئ مشروع `@ibraabyte/orbit` في EAS، والمشروع الأول الفارغ `@ibrabyte/orbit` ينتظر حذف المستخدم لأن الأمر يطلب كلمة مروره، وضُبط `EXPO_PUBLIC_API_URL` لبيئة `preview`.

## الفحص

- `npm run verify` نجح (204 اختبارات)، و`expo export` لـiOS نجح، والباك إند رد 200 على `/health`.
- البناء الأول انهار عند الفتح: `ExpoFont` يطلب رمز `_classTypes` من `ExpoModulesCore` 58.0.26 ولا يجده. السبب حزم Expo أقدم من المطلوب.
- الإصلاح: `npx expo install --fix`. بعده نجح `expo-doctor` (20/20) و`npm run verify` (206 اختبارات)، وصار الرمز موجودًا في البناء الجديد.
- ثُبت البناء `5509b632` على iPhone، وأكد المستخدم أنه يفتح. فحص الأيقونة والدخول وFace ID وتحديث `eas update` لم يُؤكد بعد.

## الناقص (يحتاج دخول المستخدم إلى Apple)

```bash
npx eas-cli@latest device:create
npx eas-cli@latest build --profile preview --platform ios
```

ثم التثبيت من الرابط، وتفعيل Developer Mode، وفحص الأيقونة وFace ID والدخول.
نشر تحديث لاحق: `npx eas-cli@latest update --channel preview --environment preview --message "..."`.
