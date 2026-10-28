# Orbit API (باك إند خاص)

بديل Supabase. خادم Python تملكه بالكامل، يشتغل على سيرفرك في Coolify.

- **FastAPI**: الـ API، ويعطيك توثيق تفاعلي على `/docs`.
- **PostgreSQL**: نفس الجداول اللي كانت في `supabase/migrations` (الـ 16 ملف) في ملف Alembic واحد: `alembic/versions/0001_initial_schema.py`.
- **SQLAlchemy + Alembic**: الجداول كـ كود، وأي تعديل بعدين يصير migration جديد.
- **الدخول**: إيميل وباسورد (Argon2). توكن دخول قصير (JWT، 15 دقيقة) وتوكن تجديد (60 يوم) يتغير مع كل تجديد. لو رجع توكن قديم مستخدم، تنقفل الجلسة كلها لأن هذا معناه إن أحد نسخه.

حماية الصفوف (RLS) صارت في الـ API: كل استعلام مفلتر بحساب المستخدم. والروابط بين الجداول (مثل تذكير يشير لمهمة) محمية بمفاتيح مركبة `(id, user_id)`، فما يقدر صف يشير لصف حساب ثاني.

## النشر على Coolify

1. في Coolify: **New Resource ← Public/Private Repository** واختر `ibraabyte/Orbit`.
2. **Build Pack**: Docker Compose. **Base Directory**: `/backend`. **Docker Compose Location**: `/docker-compose.yml`.
3. في **Domains** حط دومين للخدمة `api` مع المنفذ 8000، مثل `https://api.example.com:8000`. Coolify يسوي HTTPS بنفسه.
4. Deploy.

كلمة سر قاعدة البيانات ومفتاح التوقيع (`SERVICE_PASSWORD_64_POSTGRES` و`SERVICE_BASE64_64_JWT`) يولدها Coolify أول مرة ويحفظها في **Environment Variables**. لا ترسلها في أي محادثة.
لو ما ولدها لسبب ما، حطها يدوياً في نفس الصفحة: `SERVICE_USER_POSTGRES`، و`SERVICE_PASSWORD_64_POSTGRES` (حروف وأرقام فقط)، و`SERVICE_BASE64_64_JWT` (48 حرف أو أكثر).

بعد النشر افتح `https://api.example.com/health` وتأكد إنه يرجع `{"ok": true}`.
أول حساب يتسجل مسموح دائماً، وبعده التسجيل يتقفل. لو تبي تفتحه حط `ORBIT_ALLOW_SIGNUPS=true`.

كل تشغيل للخدمة يطبق الـ migrations الجديدة تلقائياً قبل ما يبدأ (`docker-entrypoint.sh`).
قاعدة البيانات داخل الـ compose وما لها منفذ مفتوح للإنترنت.

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

القوائم تقبل `limit` و`offset`. الحقول بنفس أسماء أعمدة Supabase، فأنواع التطبيق في `src/lib/types.ts` تشتغل بدون تغيير.

## إضافة قسم جديد

`app/crud.py` فيه `owned_crud_router`: تعطيه الجدول وشكل الإدخال والترتيب، ويطلع لك قائمة وإضافة وتعديل وحذف محمية بحساب المستخدم. مثال من `app/routers/tasks.py`:

```python
reminders_router = owned_crud_router(Reminder, prefix="/reminders", create=ReminderCreate, update=ReminderUpdate, order_by=Reminder.remind_at.asc())
```

## الخطوات الجاية

1. **التطبيق**: عميل API خفيف بدل supabase-js، وشاشة إنشاء حساب، وحفظ التوكن في SecureStore، ثم نحول الـ hooks قسم قسم (المهام واليوم/الخطة أول).
2. **باقي الأقسام**: العادات، الأهداف، اليوميات، الأكل، المصاريف، الناس، السيارات، قائمة المشاهدة، المرفقات.
3. **المهام الخلفية**: مراقبة السيرفرات، تنبيهات Seerr، تذكيرات الاشتراكات والسيارة عبر إشعارات Expo.
4. **النسخ الاحتياطي**: نسخة ليلية لقاعدة البيانات.
