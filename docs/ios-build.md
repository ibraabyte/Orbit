# بناء نسخة iPhone عبر EAS وTestFlight

هذا الدليل يثبّت Orbit على الآيفون كتطبيق عادي من TestFlight، بدل تشغيله من الماك كل مرة.
كل الخطوات تُشغَّل على الماك داخل مجلد المشروع، لأن حساب Expo وحساب Apple موجودين هناك فقط.

## ما في المستودع

- ملف `eas.json` فيه ملف بناء واحد اسمه `production`: نسخة متجر تذهب إلى TestFlight.
- رقم البناء (`buildNumber`) يزيد تلقائيًا في كل بناء، وتحفظه EAS عندها (`appVersionSource: remote`). رقم الإصدار الظاهر يبقى `version` في `app.json`.
- عنوان الخادم `EXPO_PUBLIC_API_URL` لا يُحفظ في المستودع لأنه عام. يُحفظ مرة واحدة في متغيرات بيئة EAS (`production`).
- السكربت `scripts/check-build-env.mjs` يوقف البناء على EAS مبكرًا إذا كان العنوان ناقصًا أو ليس `https`.
- إعلان التشفير (`usesNonExemptEncryption: false`) موجود في `app.json`، لأن التطبيق يستخدم `HTTPS` فقط. هذا يلغي سؤال التشفير في كل رفع.
- معرّف التطبيق `com.ibraabyte.orbit` ثابت. لا تغيّره بعد أول رفع، لأن TestFlight والودجت القادم مربوطان به.

## أول مرة

```bash
cd <مجلد-المشروع>
git pull origin main
npm install -g eas-cli
eas login
eas init
eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://<عنوان-الخادم> --visibility plaintext
eas build --platform ios --profile production
eas submit --platform ios --latest
```

- الأمر `eas init` ينشئ المشروع في حساب Expo ويضيف `extra.eas.projectId` إلى `app.json`. هذا التعديل مطلوب ويُحفظ في المستودع.
- الأمر `eas build` يسأل عن حساب Apple أول مرة، ويُنشئ الشهادات وملف التوقيع بنفسه. اختر الإجابات الافتراضية.
- الأمر `eas submit` يرفع آخر بناء إلى App Store Connect، وينشئ التطبيق هناك إن لم يكن موجودًا.
- بعد الرفع تنتظر Apple معالجة البناء (عادة من ٥ إلى ٣٠ دقيقة)، ثم يظهر في تطبيق TestFlight على الآيفون.

## كل تحديث بعد ذلك

```bash
git pull origin main
eas build --platform ios --profile production --auto-submit
```

- الخيار `--auto-submit` يرفع البناء إلى TestFlight مباشرة بعد نجاحه.

## الودجت لاحقًا

- الودجت يحتاج امتدادًا أصليًا (`WidgetKit`)، ولا يعمل في Expo Go. لذلك نسخة TestFlight هي الأساس الصحيح.
- عند إضافته: امتداد بمعرّف `com.ibraabyte.orbit.widget`، ومجموعة تطبيقات مشتركة `group.com.ibraabyte.orbit` لتبادل البيانات بين التطبيق والودجت.
- نفس ملف `production` ونفس أوامر البناء تبقى كما هي. EAS تسجّل الامتداد والمجموعة عند Apple تلقائيًا.
