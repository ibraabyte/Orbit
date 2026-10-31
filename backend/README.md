# Orbit API (باك إند خاص)

بديل Supabase. خادم Python تملكه بالكامل، يشتغل على سيرفرك في Coolify.

- **FastAPI**: الـ API، ويعطيك توثيق تفاعلي على `/docs`.
- **PostgreSQL**: نفس الجداول اللي كانت في Supabase، في ملفات Alembic تحت `alembic/versions/`.
- **SQLAlchemy + Alembic**: الجداول كـ كود، وأي تعديل بعدين يصير migration جديد.
- **الدخول**: إيميل وباسورد (Argon2). توكن دخول قصير (JWT، 15 دقيقة) وتوكن تجديد (60 يوم) يتغير مع كل تجديد. لو رجع توكن قديم مستخدم، تنقفل الجلسة كلها لأن هذا معناه إن أحد نسخه.

حماية الصفوف (RLS) صارت في الـ API: كل استعلام مفلتر بحساب المستخدم. والروابط بين الجداول (مثل تذكير يشير لمهمة) محمية بمفاتيح مركبة `(id, user_id)`، فما يقدر صف يشير لصف حساب ثاني.

## النشر على Coolify

الدليل الكامل خطوة بخطوة في ملف `DEPLOY.md`. باختصار:

1. طريقة البناء `Docker Compose`، والمجلد الأساسي `/backend`، والملف `/docker-compose.yml`.
2. الدومين عند خدمة `api` مع المنفذ 8000، مثل `https://api.example.com:8000`.
3. كلمة سر القاعدة ومفتاح التوقيع (`SERVICE_PASSWORD_64_POSTGRES` و`SERVICE_BASE64_64_JWT`) يولدها Coolify بنفسه.
4. بعد النشر: `https://api.example.com/health` لازم يرجع `{"ok":true}`، وسجّل حسابك فوراً (أول حساب فقط مسموح).

كل تشغيل للخدمة يطبق الـ migrations الجديدة تلقائياً قبل ما يبدأ (`docker-entrypoint.sh`).
قاعدة البيانات داخل الـ compose وما لها منفذ مفتوح للإنترنت.

## ربط WHOOP والملخص بالذكاء الاصطناعي

اختياري. بدون هذي القيم، شاشة WHOOP في التطبيق تقول إنه مو مفعّل، وباقي الخادم يشتغل عادي.

### 1. تطبيق في موقع WHOOP للمطورين

1. ادخل `developer-dashboard.whoop.com` بحساب WHOOP حقك، وسوّ **Team** لو طلب، ثم **Create App**.
2. **Redirect URL**: `https://<دومين الـ API>/whoop/callback` (نفس دومين Coolify، مثل `https://api.example.com/whoop/callback`).
3. **Scopes**: `read:recovery`، `read:cycles`، `read:sleep`، `read:workout`، `read:profile`. والخادم يطلب `offline` بنفسه عشان يقدر يزامن وأنت مو فاتح التطبيق.
4. احفظ، وانسخ **Client ID** و**Client Secret**.

### 2. القيم في Coolify (Environment Variables)

| المتغير | القيمة |
| --- | --- |
| `WHOOP_CLIENT_ID` | من تطبيق WHOOP |
| `WHOOP_CLIENT_SECRET` | من تطبيق WHOOP (سري) |
| `WHOOP_REDIRECT_URI` | نفس الـ Redirect URL بالضبط |
| `ANTHROPIC_API_KEY` | مفتاح من `console.anthropic.com` للملخص المكتوب (سري، اختياري) |

بعدها Redeploy. لا ترسل القيم السرية في أي محادثة.

### كيف يشتغل

- **الربط**: التطبيق يفتح صفحة دخول WHOOP، وWHOOP يرجّع المتصفح لـ `/whoop/callback`، والخادم يحفظ التوكنات **مشفّرة** ويرجّعك للتطبيق.
- **المزامنة**: أول مرة تسحب آخر 180 يوم. بعدها كل ساعتين، وكل مرة تعيد قراءة آخر 7 أيام لأن WHOOP يعدّل الأرقام بعد ما يكمل حسابها.
- **النبض**: WHOOP ما يعطي نبض لحظي في الـ API. اللي متوفر: النبض وقت الراحة ومتوسط وأعلى نبض لكل يوم ولكل تمرين، والـ HRV.
- **الملخص**: يرسل لـ Claude (`claude-opus-5-5`) الأرقام المحسوبة فقط (بدون اسمك أو إيميلك)، ويرجع ملخص وتوصيات بالعربي. ينحفظ آخر ملخص، وما ينكتب جديد إلا لما تضغط الزر.
- **فصل الربط**: يلغي صلاحية Orbit عند WHOOP ويمسح التوكنات. تقدر تحتفظ بالبيانات أو تمسحها.

## التشغيل محلياً

```bash
cd backend
uv sync
cp .env.example .env   # وحط ORBIT_JWT_SECRET
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

## الاختبارات

تحتاج قاعدة Postgres فاضية (تنمسح كل مرة):

```bash
ORBIT_TEST_DATABASE_URL=postgresql+psycopg://orbit:orbit@localhost:5432/orbit_test uv run pytest
```

نفس الاختبارات تشتغل في GitHub Actions مع كل PR يغير `backend/`.

## الـ API الحالي

| المسار | الوظيفة |
| --- | --- |
| `GET /auth/status` | هل التسجيل مفتوح (عشان التطبيق يعرض "إنشاء حساب") |
| `POST /auth/sign-up`، `/auth/sign-in`، `/auth/refresh`، `/auth/sign-out` | الدخول والجلسات |
| `POST /auth/sign-out-everywhere`، `/auth/password`، `/auth/delete-account` | الأمان والحساب |
| `GET`/`PATCH /profile` | الإعدادات والأهداف |
| `/tasks` و `/tasks/{id}` | المهام. مهمة فيها `reminder_at` يتسوى تذكيرها مع نفس الطلب |
| `POST /tasks/{id}/complete` | إنهاء مهمة: يلغي تذكيراتها، ولو متكررة يسوي اللي بعدها بنفس الوسوم |
| `/reminders` و `/reminders/{id}` | التذكيرات |
| `GET /dashboard` | كل بيانات "اليوم" و"الخطة" في طلب واحد، بنفس شكل `DashboardData` في التطبيق |
| الأقسام: `/captures`، `/meals`، `/meal-plans`، `/grocery-items`، `/weight-logs`، `/workouts`، `/sleep-logs`، `/focus-sessions`، `/habits`، `/habit-logs`، `/goals`، `/goal-milestones`، `/journal-entries`، `/people`، `/expenses`، `/bills`، `/vehicles`، `/watch-items` | قائمة وإضافة وتعديل وحذف لكل قسم، محمية بحساب المستخدم |
| الوسوم: `/tags`، `/taggings`، `POST /tags/ensure` | الوسوم. أغلب الأقسام تقبل `tags` (أسماء) مع الإضافة، فتنربط في نفس الطلب |
| `PUT /journal-entries/day/{date}` | يوميات اليوم: وحدة لكل يوم، الكتابة الثانية تستبدل الأولى |
| `PUT /watch-items` | يضيف فيلم أو مسلسل، أو يحدّثه لو موجود |
| `GET /export` | كل بيانات المستخدم في ملف JSON واحد (بدون أسرار الإشعارات) |
| `GET /whoop/status`، `POST /whoop/connect`، `GET /whoop/callback` | حالة WHOOP والربط |
| `POST /whoop/sync`، `DELETE /whoop/connection` | مزامنة الآن، وفصل الربط (`?delete_data=true` يمسح البيانات) |
| `GET /whoop/summary?days=30` | الأرقام يوم بيوم، والمتوسطات، وهذا الأسبوع مقابل اللي قبله، ومناطق التعافي، والتمارين |
| `GET /whoop/insights/latest`، `POST /whoop/insights` | آخر ملخص بالعربي، وكتابة ملخص جديد |

القوائم تقبل `limit` و`offset`. الحقول بنفس أسماء أعمدة Supabase، فأنواع التطبيق في `src/lib/types.ts` تشتغل بدون تغيير.

## إضافة قسم جديد

`app/crud.py` فيه `owned_crud_router`: تعطيه الجدول وشكل الإدخال والترتيب، ويطلع لك قائمة وإضافة وتعديل وحذف محمية بحساب المستخدم. مثال من `app/routers/tasks.py`:

```python
reminders_router = owned_crud_router(
    Reminder, prefix="/reminders", create=ReminderCreate, update=ReminderUpdate, order_by=Reminder.remind_at.asc()
)
```

## الخطوات الجاية

1. **المرفقات**: رفع الملفات يحتاج مكان تخزين على السيرفر (ما فيه شاشة له في التطبيق الحين).
2. **المهام الخلفية**: مراقبة السيرفرات، تنبيهات Seerr، تذكيرات الاشتراكات والسيارة عبر إشعارات Expo.
3. **النسخ الاحتياطي خارج السيرفر**: النسخة الليلية (في `DEPLOY.md`) تنحفظ على نفس السيرفر؛ نقلها لمكان ثاني خطوة جاية.
