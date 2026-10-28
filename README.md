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

Apply the SQL files in `supabase/migrations/` in number order first (`0015_vehicles.sql` for the car screen and `0016_watch_items.sql` for the watch list are new). To make
one bundle: `npm run migrations:bundle -- --out /path/to/orbit-migrations.sql`.

Local database instead (needs Docker): `npx supabase start` runs Supabase on ports 553xx and applies every
migration. Put its `API_URL` (`http://127.0.0.1:55321`) and `ANON_KEY` from `npx supabase status` in `.env.local`.
The app swaps `127.0.0.1` for the Mac's address that Expo already uses, so the phone reaches it on the same Wi-Fi.
Add your account in Studio (http://127.0.0.1:55323 → Authentication → Add user). Stop with `npx supabase stop`.

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
