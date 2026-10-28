# Orbit

Orbit is a private life dashboard for iPhone and Android, built with Expo.
It brings daily planning, tasks, reminders, health, money, relationships, and
personal notes into one app, backed by Supabase.

The Next.js web/PWA version is archived at the git tag `web-final`. `APP_PAGES.md`
lists the screens and `BACKLOG.md` what is left.

## Tech stack

- Expo SDK 58, Expo Router, React Native, TypeScript
- Supabase Auth and Postgres (session stored with AsyncStorage)
- Vitest for the shared logic in `src/lib`
- Moving to: `backend/`, a FastAPI + Postgres API hosted on Coolify. The app still talks to Supabase until its hooks are switched over.

## Getting started

Requirements: Node.js 22, npm, a Supabase project, and Expo Go or a simulator.

```bash
npm install
cp .env.example .env.local   # fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npm start
```

The database is self-hosted Supabase: `deploy/supabase/README.md` sets it up and builds
every table from `supabase/migrations/`. For another Supabase project, apply those SQL files in
number order, or make one bundle with `npm run migrations:bundle -- --out /path/to/orbit-migrations.sql`.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run ios` / `npm run android` | Open in a simulator |
| `npm test` | Run the `src/lib` tests (time zone pinned to Asia/Riyadh) |
| `npm run typecheck` | TypeScript check |
| `npm run verify` | Typecheck and tests |

## Project structure

- `src/app/` — Expo Router screens (`(tabs)` for the tab bar, `sign-in`)
- `src/components/` — shared UI and the quick-add bar
- `src/hooks/` — data loading shared across tabs
- `src/lib/` — plain TypeScript logic and Supabase actions, with tests
- `supabase/migrations/` — database schema and row-level security
- `deploy/supabase/` — self-hosted Supabase setup and the scripts to move data and files
- `backend/` — Orbit's own API (FastAPI + Postgres) that is replacing Supabase; see `backend/README.md`
