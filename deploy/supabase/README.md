# نقل قاعدة Orbit إلى خادمك (Supabase ذاتي)

> جُرّبت الخطوات كاملة على Docker (أكتوبر 2026): الإعداد، نقل الحسابات والبيانات من قاعدة قديمة، الدخول بنفس كلمة السر،
> حماية الصفوف، نقل الملفات، والنسخة الليلية. باقي تجربتها على خادمك الحقيقي.

الفكرة: نشغّل Supabase نفسه على خادمك عبر Docker. التطبيق يبقى كما هو؛ يتغير الرابط والمفتاح فقط في `.env.local`.
الدخول وحماية الصفوف (RLS) والملفات المرفقة كلها تبقى تعمل.

لماذا ليس Postgres عاديًا؟ التطبيق يستخدم دخول Supabase (`auth`) وتخزين الملفات (`orbit-attachments`).
مع Postgres وحده يلزم إعادة كتابة الدخول والتخزين. هذا شغل كبير بلا فائدة.

## المتطلبات

- خادم Linux عليه Docker مع إضافة Compose (الإصدار 2.24 أو أحدث)، وذاكرة 4GB على الأقل (Supabase مع Seerr).
- نطاق فرعي يشير للخادم، مثل `db.example.com`. التطبيق على الآيفون يحتاج HTTPS.
- دخول SSH للخادم.

## الخطوات

### 1) تشغيل Supabase على الخادم

```bash
scp deploy/supabase/setup-server.sh server:~
ssh server 'PUBLIC_URL=https://db.example.com bash setup-server.sh'
```

السكربت يولّد كلمات سر ومفاتيح جديدة في `~/supabase/.env` على الخادم. لا ترسلها في أي محادثة.
التسجيل الجديد مقفل (`DISABLE_SIGNUP=true`)؛ حسابك ينتقل من المشروع القديم بنفس كلمة السر.
المنافذ (8000 و5432) مربوطة على `127.0.0.1` فقط، فما تنفتح للإنترنت حتى لو الجدار الناري ما يمنعها.
نسخة Supabase مثبّتة على إصدار مجرّب، فما تتغير عليك فجأة.

### 2) HTTPS أمام المنفذ 8000

أبسط طريقة Caddy على الخادم. ملف `/etc/caddy/Caddyfile`:

```
db.example.com {
  reverse_proxy localhost:8000
}
```

في الجدار الناري افتح 22 و80 و443 فقط.

### 3) نقل البيانات (من الماك)

افتح نفقًا آمنًا لقاعدة الخادم في نافذة منفصلة:

```bash
ssh -N -L 5440:localhost:5432 server
```

ثم من مجلد المشروع:

```bash
OLD_DB_URL='رابط Session pooler من لوحة Supabase القديمة' \
NEW_DB_URL='postgresql://postgres.orbit:POSTGRES_PASSWORD@host.docker.internal:5440/postgres' \
bash deploy/supabase/move-data.sh
```

- `POSTGRES_PASSWORD` من `~/supabase/.env` على الخادم.
- السكربت يقرأ فقط من القديم. يبني كل الجداول من `supabase/migrations` بالترتيب (ومنها 0015 للسيارة و0016 لقائمة المشاهدة)، ثم ينسخ الحسابات وكل بيانات `public`. ما تحتاج تشغّل أي migration بيدك.
- لو تبي تبدأ بقاعدة فاضية بدون نقل، اترك `OLD_DB_URL` فاضي، وبعدها أضف حسابك من Studio (Authentication ← Add user).
- لو شغّلته مرة ثانية على قاعدة فيها الجداول، يوقف بدون ما يغيّر شي، عشان ما تتكرر البيانات.

### 4) نقل الملفات المرفقة

```bash
OLD_URL=https://<ref>.supabase.co OLD_SERVICE_KEY=... \
NEW_URL=https://db.example.com NEW_SERVICE_KEY=... \
node deploy/supabase/move-files.mjs
```

بعدها احذف `deploy/supabase/.dump/` لأنه فيه بياناتك الشخصية.

### 5) تحويل التطبيق

في `.env.local`:

```
EXPO_PUBLIC_SUPABASE_URL=https://db.example.com
EXPO_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY من ~/supabase/.env>
```

أعد تشغيل التطبيق وسجّل الدخول. لا تحذف المشروع القديم حتى تتأكد أن كل شيء موجود.

## بعد النقل

- النسخ الاحتياطي: Supabase الذاتي لا يأخذ نسخًا تلقائية. على الخادم شغّل `crontab -e` وأضف هذا السطر.
  يأخذ نسخة كل ليلة الساعة 3 ويحذف ما هو أقدم من 14 يومًا:

  ```
  0 3 * * * mkdir -p ~/backups && docker exec supabase-db pg_dump -U postgres -Fc postgres > ~/backups/orbit-$(date +\%F).dump && find ~/backups -name 'orbit-*.dump' -mtime +14 -delete
  ```

  الملفات المرفقة محفوظة في `~/supabase/volumes/storage`. انسخها مع النسخ لو تبي نسخة كاملة.
- لوحة التحكم (Studio) على المنفذ 8000 نفسه، ومحمية بـ `DASHBOARD_USERNAME` و`DASHBOARD_PASSWORD`.
