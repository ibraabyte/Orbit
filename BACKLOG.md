# Orbit Backlog

## Production Launch Blockers

- Configure real `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, VAPID keys, `VAPID_SUBJECT`, and a strong `CRON_SECRET` in local production-like env and Vercel.
- Configure Supabase Auth redirect URLs for local and production domains.
- Apply the generated Supabase migration bundle, or each numbered migration, to the production Supabase project.
- Run `npm run preflight -- --env-file .env.local` with real production values before deploy.
- Deploy to Vercel with HTTPS and Vercel Cron calling `/api/reminders/send`.
- Run `npm run smoke -- --origin https://your-production-domain.example` after deploy.

## Manual Production QA

- Complete a full signup and onboarding setup pass against production.
- Verify Inbox triage, weekly plan, review save, command quick-add, global search, tag search, calendar agenda, and `.ics` export.
- Verify task reminders, standalone reminders, snooze behavior, Vercel Cron delivery, and push diagnostics.
- Test web push on Chrome/Edge desktop, Android Chrome, and an installed iOS PWA.
- Verify PWA install, service worker update behavior, offline fallback, cached dashboard fallback, and Settings readiness checks with evidence notes.
- Verify mobile share target with normal links/text/images and large-image rejection.
- Verify screenshot upload, signed attachment viewing, and large-file rejection.
- Verify food planning, grocery items, workouts, sleep logs, weight logs, focus blocks, expenses, recurring bills, people follow-ups, birthdays, habits, goals, milestones, and journal entries.
- Verify full JSON export/import, CSV export, browser-local backup health reminders, sign-out rescue download for pending offline captures, and full account deletion.
- After sign-out and account deletion, confirm push unsubscribe and cleanup of cached personal pages, offline queue data, share-target payloads, and local backup/readiness state.

## Follow-Up Engineering

- Add authenticated browser/E2E coverage once real local Supabase env is available; the in-app browser currently shows the setup screen, so authenticated shell interactions cannot be visually clicked locally yet.
- Add a visual QA pass for the local privacy shield overlay on desktop and mobile after local auth is configured.
- Consider adding a small Playwright or React component-test setup if future UI behavior needs click-level regression coverage beyond the current source-level drift tests.
- Re-run `npm run verify`, `npm run audit`, `npm run migrations:bundle -- --check`, `npm run preflight -- --env-file .env.local`, and production smoke after every launch-blocker change.
