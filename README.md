# Orbit

Orbit is a private life dashboard for iPhone and Android, built with Expo.
It brings daily planning, tasks, reminders, health, money, relationships, and
personal notes into one app, backed by Supabase.

The Next.js web/PWA version is archived at the git tag `web-final`. Screens are
being moved over one by one; see the migration plan.

## Tech stack

- Expo SDK 58, Expo Router, React Native, TypeScript
- Supabase Auth and Postgres (session stored with AsyncStorage)
- Vitest for the shared logic in `src/lib`

## Getting started

Requirements: Node.js 22, npm, a Supabase project, and Expo Go or a simulator.

```bash
npm install
cp .env.example .env.local   # fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
npm start
```

Apply the SQL files in `supabase/migrations/` in number order first. To make
one bundle: `npm run migrations:bundle -- --out /path/to/orbit-migrations.sql`.

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
