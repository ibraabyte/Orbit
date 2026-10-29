# Orbit

Orbit is a private life dashboard for iPhone and Android, built with Expo.
It brings daily planning, tasks, reminders, health, money, relationships, and
personal notes into one app, backed by its own server (`backend/`).

The Next.js web/PWA version is archived at the git tag `web-final`. `APP_PAGES.md`
lists the screens and `BACKLOG.md` what is left.

## Tech stack

- Expo SDK 58, Expo Router, React Native, TypeScript
- `backend/`: FastAPI + Postgres 17, hosted on Coolify. Sign-in, sessions and every section's data
  (session tokens kept in SecureStore)
- Vitest for the shared logic in `src/lib`, pytest for the server

## Getting started

Requirements: Node.js 22, npm, Orbit's server (`backend/`, see `backend/README.md`), and Expo Go or a simulator.

```bash
npm install
cp .env.example .env.local   # set EXPO_PUBLIC_API_URL to Orbit's server, e.g. https://api.example.com
npm start
```

Every screen reads and writes through Orbit's own server. The database schema lives in
`backend/alembic/versions/`; the server applies it on start.

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
- `src/lib/` — plain TypeScript logic, the API client (`api.ts`) and its writes (`api-actions.ts`), with tests
- `backend/` — Orbit's own API (FastAPI + Postgres); see `backend/README.md`
