# قرار: نشر Orbit للمستخدم وحده عبر Ad Hoc مع EAS Update — 2026-11-01

- اخترنا بناء Ad Hoc (ملف `preview` في `eas.json`) لآيفون مسجل، مع EAS Update لتعديلات الكود.
- السبب: TestFlight تنتهي نسخه كل 90 يومًا، وAd Hoc يبقى سنة تقريبًا. App Store غير المدرج يحتاج مراجعة Apple.
- الثمن: تجديد البناء سنويًا، وبناء جديد لأي تغيير أصلي. سياسة `runtimeVersion` هي `appVersion`، فتغيير `version` يحتاج بناءً جديدًا.
- المشروع في حساب Expo `ibraabyte` باختيار المستخدم، ورابط الباك إند في متغير `EXPO_PUBLIC_API_URL` ضمن بيئة `preview` في EAS.
