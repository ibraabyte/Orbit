# Orbit

Orbit is a personal life dashboard PWA for tasks, focus sessions, reviews, people and relationship follow-ups, meal planning, groceries, reminders, workouts, sleep, weight tracking, finance, and saved links/screenshots.

## Stack

- Next.js App Router with TypeScript
- Supabase Auth, Postgres, Storage, and Row Level Security
- Custom service worker and web app manifest
- Web Push reminders using VAPID keys

## Getting Started

1. Copy `.env.example` to `.env.local`.
2. Create a Supabase project and fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Apply the SQL migrations in order from `supabase/migrations/` in Supabase SQL editor or via Supabase CLI. For a fresh Supabase project, generate one reviewed bundle with `npm run migrations:bundle -- --out /tmp/orbit-migrations.sql`.
4. Create VAPID keys with `npm run vapid:generate`, then set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. Use a real `mailto:` contact or HTTPS URL for `VAPID_SUBJECT`.
5. Set a random `CRON_SECRET` of at least 32 characters in production so scheduled reminder sends are protected. Local development can still run the endpoint manually without it.
6. Set `ORBIT_SMOKE_ORIGIN` to the production HTTPS origin when you want preflight to print the exact post-deploy smoke command.
7. Install dependencies and run the app:

```bash
npm install
npm run dev
```

The app runs at `http://localhost:3000`.

## Implemented V1

- Daily dashboard with explicit owner-filtered reads for tasks, focus sessions, people follow-ups, food planning, groceries, reminders, quick capture, health, sleep/recovery, finance, habits, goals, journal, review, and weekly review.
- First-run setup guidance that tracks core setup progress across preferences, tasks, focus, reminders, captures, people, health/recovery, finance, habits, goals, and journal.
- Inbox triage for overdue work, undated tasks, stale focus blocks, standalone and task due reminders, people follow-ups, untagged captures, missing sleep logs, overdue bills, unclassified spending, stale goals, missed routines, and missing journal coverage, with inline actions for deterministic fixes.
- Weekly planning page with task load, focus execution, people follow-ups and birthdays, health and recovery targets, bill pressure, spending totals, habit coverage, goal deadlines, and recommended next actions.
- Review workflow for morning, evening, and weekly check-ins with readiness scoring, people reminders, cross-module gaps, prompts, actions, and journal save.
- Food planning with planned meals, calories/macros, grocery queue, linked meal prep, one-tap meal logging, calendar/search support, and macro-aware quick-add commands.
- People tracking with relationships, contact methods, favorite people, birthday reminders, follow-up dates, notes, calendar/search support, and quick-add commands.
- Owner preferences for timezone, default weight unit, daily calorie target, and weekly workout target.
- Task recurrence for daily, weekly, and monthly tasks.
- Focus sessions for planned or completed deep work, task-linked execution, weekly focus minutes, and focus insights.
- Sleep tracking for recovery duration, quality, calendar history, and insights.
- Finance tracking for expenses, recurring bills, subscriptions, category totals, bill advancement, and money insights.
- Tags on tasks, captures, meals, and workouts with search/filter screens.
- Library organizer for saved links, social sources, screenshots, notes, source/type/file filters, link copy, tags, and signed attachment viewing.
- Private size-limited screenshot/file uploads with paste/drop capture, safe storage paths, rollback cleanup, and signed URL viewing.
- Offline app shell with recurring service worker update checks, app-shell/readiness drift tests, offline link/note/screenshot capture queue with Settings inspection/retry/discard/validated non-overwriting rescue import/export controls, sign-out rescue prompt for pending queued captures, cached dashboard readback and request-failure fallback, and sign-out/delete cleanup for personal browser caches.
- In-app PWA install panel with browser prompt support, platform fallback guidance, install icons, and maskable manifest coverage.
- Web Push subscription, current-device push disable, sign-out push unsubscribe, local test notifications, protected Node.js scheduled reminder send endpoint with strict production cron-secret checks, operational delivery diagnostics, failure status for non-expired push send errors, delivery marking only after a successful push send, expired subscription cleanup, safe same-origin notification click routing, due reminder snoozing, and Today/Inbox visibility for standalone reminders and task reminder times.
- Device and authenticated server readiness diagnostics for secure context/HTTPS, install mode, service worker, offline fallback and app-shell asset cache coverage, push support and permission state, manifest, export support, Supabase URL/configuration quality, VAPID sender keys/contact quality, cron protection strength, and launch checklist status with evidence notes, evidence-gap warnings, an explicit manual launch gate, and copy/download QA reports.
- Production security headers for content security policy enforcement, HTTPS persistence, cross-origin isolation boundaries, content sniffing, frame embedding, referrer leakage, browser permissions, service worker scope, private no-store personal route/API caching, PWA update freshness, database-side owner-reference guards, schema/type/data-lifecycle drift tests, and indexed owner-scoped dashboard reads.
- Local privacy shield with manual hide controls, a keyboard shortcut, and an optional background auto-shield preference for shared-screen moments.
- Personal-data indexing protection with noindex metadata, `X-Robots-Tag`, and a disallow-all `robots.txt`.
- Full JSON database export with current-user private attachment embedding, browser-local backup health reminders, unsafe attachment metadata filtering, SHA-256 embedded file checksums, export/import embedded file integrity checks, dangling backup-reference repair, and push-subscription secret redaction, non-destructive backup import, and full owner-scoped account deletion endpoint.
- Habit momentum with daily/weekly progress and current streaks.
- Goals with milestones and progress.
- Daily journal with mood history.
- Global search across tasks, focus, people, food planning, captures, attachment filenames, health, sleep, finance, habits, goals, and journal, with type filters for narrowing results.
- Global keyboard shortcuts for Command (`Cmd/Ctrl K`) and Search (`/`) when not typing in a form field.
- PWA share target for saving bounded links/text and up to five size-limited shared images from supported mobile browsers, plus a desktop browser bookmarklet for quick page capture.
- Insights page with calorie, workout, focus, sleep, spending, bill, habit, mood, weight, and goal trends.
- Calendar agenda that groups dated tasks, focus blocks, reminders, people follow-ups, birthdays, planned meals, groceries, meals, workouts, sleep logs, weight logs, expenses, bills, journal entries, and goal deadlines, with `.ics` export for the visible agenda.
- Command page for one-line quick add across tasks, people, focus sessions, meal plans, grocery items, reminders, captures, meals, workouts, sleep, weight, expenses, bills, habits, goals, and journal, with natural `@due` tokens, separate `~reminder` tokens, recurring task repeat tokens, meal macro tokens, and grocery quantity tokens.

## Verification

```bash
npm run verify
npm run audit
npm run migrations:bundle -- --check
npm run preflight -- --env-file .env.local
npm run smoke -- --origin http://localhost:3000
```

## Docker

Create `.env.local` from `.env.example`, then build and run:

```bash
docker compose --env-file .env.local up --build
```

The app is available at `http://localhost:3000`.

Next.js public environment variables are built into the browser bundle, so
rebuild the image after changing `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, or `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.

## Production Checklist

- Configure Supabase Auth redirect URLs for local and production domains.
- Set all environment variables in Vercel.
- Run `npm run preflight -- --env-file .env.local` against production values before deploy. Preflight checks environment quality, Vercel Cron, Supabase migration order/checksum, and the production smoke origin when `ORBIT_SMOKE_ORIGIN` is set.
- Apply the generated migration bundle or each numbered migration to the production Supabase project.
- Run `npm run smoke -- --origin https://your-production-domain.example` after deploy to verify user-facing routes, privacy headers, manifest, service worker, share target metadata, and robots policy.
- Replace local Supabase URLs, placeholder VAPID contacts, and cron secrets shorter than 32 random characters before production.
- Serve production over HTTPS so service worker, push, install, and share target APIs run in a secure context.
- Confirm the production domain is private/unlisted as intended and that `/robots.txt` disallows indexing.
- Confirm Vercel Cron calls `/api/reminders/send` with `CRON_SECRET` configured.
- Test web push on Chrome/Edge desktop, Android Chrome, and installed iOS PWA.
- Run a full signup, onboarding setup pass, Inbox triage, PWA install, Settings readiness check with evidence notes, weekly plan, review save, task reminder push, standalone reminder push, people follow-up, birthday reminder, food plan, grocery item, mobile share target with large-image rejection, command quick-add, screenshot upload with large-image rejection, global search, calendar agenda, insights review, tag search, recurring task, focus block, sleep log, expense log, bill advancement, habit check-in, goal milestone, journal entry, full export/import, and delete-account pass against production.
- Before sign-out with pending offline captures, confirm the rescue copy downloads; after sign-out or account deletion, confirm push is unsubscribed and cached personal pages, offline queue data, and share-target payloads are gone on the test browser.
