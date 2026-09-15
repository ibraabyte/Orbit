# Orbit

Orbit is a private, mobile-first life dashboard. It brings daily planning,
tasks, reminders, health, money, relationships, and personal notes into one
calm progressive web app.

## Highlights

- **Plan the day:** Today dashboard, weekly planning, reviews, inbox triage,
  recurring tasks, reminders, and focus sessions.
- **Track life:** Meals, groceries, workouts, sleep, weight, expenses, bills,
  habits, goals, people, birthdays, and journal entries.
- **Capture quickly:** One-line commands, links, notes, screenshots, mobile
  share target, and a searchable library.
- **Work anywhere:** Installable PWA, offline capture queue, cached dashboard,
  push notifications, and calendar export.
- **Keep data private:** Supabase authentication, owner-scoped records, row
  level security, private file storage, backup import/export, and account
  deletion.

## Tech stack

- Next.js 15, React 19, and TypeScript
- Tailwind CSS 4
- Supabase Auth, Postgres, and Storage
- Vitest and Testing Library
- Custom service worker and Web Push
- Docker and Vercel deployment support

## Getting started

### Requirements

- Node.js 22
- npm
- A Supabase project

### 1. Install the app

```bash
git clone <repository-url>
cd Orbit
npm ci
```

### 2. Configure the environment

```bash
cp .env.example .env.local
```

Fill in the Supabase settings in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

For push reminders, generate VAPID keys:

```bash
npm run vapid:generate
```

Then add `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
`VAPID_SUBJECT` to `.env.local`. Production deployments also need a random
`CRON_SECRET` with at least 32 characters.

### 3. Prepare the database

Apply the SQL files in `supabase/migrations/` in number order. You can also
create one reviewed migration bundle:

```bash
npm run migrations:bundle -- --out /tmp/orbit-migrations.sql
```

Apply the generated file with the Supabase SQL editor or CLI.

### 4. Start development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production build |
| `npm run test` | Run the test suite |
| `npm run lint` | Check code style |
| `npm run typecheck` | Check TypeScript types |
| `npm run verify` | Run type checks, lint, tests, and build |
| `npm run audit` | Check dependencies for known issues |
| `npm run preflight -- --env-file .env.local` | Check deployment readiness |
| `npm run smoke -- --origin <url>` | Check a running deployment |

## Docker

Create `.env.local`, then run:

```bash
docker compose --env-file .env.local up --build
```

Orbit will be available at [http://localhost:3000](http://localhost:3000).
Rebuild the image after changing any `NEXT_PUBLIC_*` value because these
settings are included in the browser bundle at build time.

## Project structure

```text
src/app/               Pages and API routes
src/components/        Screens and shared UI components
src/hooks/             Shared React hooks
src/lib/               Domain logic and utilities
src/lib/__tests__/     Unit and integration tests
public/                PWA icons, manifest, and service worker
scripts/               Migration, preflight, and smoke-check tools
supabase/migrations/   Database schema and security migrations
```

## Deployment notes

- Use HTTPS in production. PWA install, service workers, and push notifications
  require a secure origin.
- Add the production and local URLs to the Supabase Auth redirect allowlist.
- Configure all values from `.env.example` in the hosting environment.
- The included Vercel cron calls `/api/reminders/send` every five minutes.
- Run the preflight check before deployment and the smoke check afterward.

## More documentation

- [`PRODUCT.md`](PRODUCT.md) explains the product goals and design principles.
- [`DESIGN.md`](DESIGN.md) documents the Drift design system.
- [`APP_PAGES.md`](APP_PAGES.md) lists the app routes and screen behavior.
- [`BACKLOG.md`](BACKLOG.md) tracks remaining work.
