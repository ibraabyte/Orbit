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

## الودجت (مسطرة اليوم)

- الودجت امتداد أصلي (`WidgetKit`) يبنيه `expo-widgets` من `src/widgets/today-widget.tsx`، ولا يعمل في Expo Go. يحتاج بناء جديد على الجهاز.
- يعرض "الآن"، ثم الصلوات والمهام والوجبات الجاية على خط زمني، وعدد المتأخر تحت. الأحجام: صغير ومتوسط وكبير.
- معرّف الامتداد `com.ibraabyte.orbit.ExpoWidgetsTarget`، ومجموعة التطبيقات المشتركة `group.com.ibraabyte.orbit`. الاثنين يُعرّفان تلقائيًا من `app.json`.
- التطبيق يكتب لقطة صغيرة في المجموعة المشتركة كل ما تغيّرت بيانات اليوم، والودجت يقرأها. ما يكلّم الخادم بنفسه.

البناء على الماك (توزيع داخلي `Ad Hoc`):

```bash
git pull origin main
eas build --platform ios --profile preview
```

- أول بناء فيه الودجت يسألك عن ملف توقيع للامتداد. اختر الإجابة الافتراضية (`Yes`)، وEAS تسجّل المعرّف والمجموعة عند Apple بنفسها.
- إذا قال إن المجموعة غير مفعّلة، شغّل `eas credentials --platform ios` واختر إعادة إنشاء ملف التوقيع، ثم ابنِ مرة ثانية.
- ثبّت البناء من الرابط اللي يطلع، وافتح Orbit مرة وسجّل دخولك، ثم أضف الودجت من الشاشة الرئيسية (اضغط مطولًا ثم `+` ثم Orbit).
- لو قفل التطبيق مفعّل، الودجت يخفي العناوين ويعرض نوع الشي فقط (مهمة، وجبة)، لأن Face ID ما يغطي الشاشة الرئيسية.
