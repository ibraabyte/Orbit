# قرار: وكيل الاتصال يقدر يتكلم بـ ElevenLabs

- الحالة: مقبول (طلبه المستخدم في جلسة 2026-11-15).
- المشكلة: مكالمات الجوال العادية (Twilio) كانت تشتغل على OpenAI Realtime بس. والمستخدم يبي يستخدم ElevenLabs عشان أصواته العربية.
- البدائل:
  - تكامل ElevenLabs الجاهز مع Twilio (هم اللي يتصلون): مرفوض. يحتاج نقل الرقم لحساب ElevenLabs، وما يناسب الجوال الموثّق (Verified Caller ID). وكمان يطلّع الكلام والنتيجة من يد Orbit.
  - خادم Orbit في النص (المختار): يجي صوت Twilio لـ `/calls/stream` مثل ما هو الحين، ويروح لوكيل ElevenLabs عن طريق websocket برابط موقّع. والوكيل يسمع ويتكلم بصيغة `ulaw_8000`، فما يحتاج أي تحويل للصوت.
- الاختيار:
  - في حساب المستخدم وكيل ثاني اسمه "Orbit phone agent"، وأداته الوحيدة `finish_call` (client tool).
  - كل مكالمة ترسل نفس التعليمات والقواعد، ويرسل معها أول كلامه الثابت كـ `first_message`.
  - الصوت يحفظ في `PhoneConnection.voice`، ويكون واحد من أصوات OpenAI أو `voice_id` من ElevenLabs.
  - الاختيار من الربط ← "وش يستخدم كل شي" ← وكيل الاتصال. وإذا ما فيه مفتاح OpenAI، يصير ElevenLabs هو الافتراضي.
- الأثر:
  - الملفات: `backend/app/services/{elevenlabs_call,phone_agent,feature_models}.py`، و`backend/app/routers/calls.py`، وشاشة `src/app/phone-calls.tsx`.
  - انتهاء المكالمة: بعد `finish_call`، كل قطعة من صوت الوداع تتبعها علامة مرقّمة (`goodbye-N`). أول ما Twilio يشغّل آخر علامة، يسكّر Orbit الخط. وفيه مهلة احتياط ٨ ثواني.
  - ما تجرّب على مكالمة حقيقية لين الحين. الاختبارات تستخدم websocket مزيّف يقلّد ElevenLabs.
