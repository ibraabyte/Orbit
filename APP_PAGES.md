# Orbit App Design Handoff

This document explains the current Orbit app pages and what each one does, based on the code in `src/app` and `src/components`. It is written as a handoff for a design agent.

Last checked against the code: July 2, 2026.

## Product Summary

Orbit is a private personal life dashboard PWA. It helps one owner run daily life across tasks, reminders, planning, review, focus, health, food, groceries, finance, people, habits, goals, journaling, saved links/screenshots, search, calendar, notifications, offline capture, backup/export, and settings.

The app should feel:

- Calm, precise, personal, and trustworthy.
- Dense enough for repeated daily use.
- Fast to scan on desktop and mobile.
- Practical and private, not playful or gamified.
- Like a personal operating system for life admin.

Avoid:

- Marketing landing-page layouts.
- Generic SaaS dashboard visuals.
- Noisy gradients or decorative cards.
- Fitness-bro health styling.
- CRM-like relationship tracking.
- Gamified streak pressure.
- Notion-style blank-canvas ambiguity.

## Global App Structure

Most app pages are protected routes inside `src/app/(app)` and render through `src/components/app-shell.tsx`.

The app shell provides:

- Desktop fixed sidebar navigation.
- Desktop command/search quick actions.
- Mobile top bar.
- Mobile bottom navigation.
- Auth protection.
- Sign out.
- Privacy shield/hide app action.
- Global keyboard shortcuts.
- Offline status banner.
- Supabase setup-required fallback.
- Loading skeleton while auth state resolves.

Navigation groups in the current code:

| Group | Pages |
|---|---|
| Run the day | Today, Plan, Review, Inbox, Command, Search |
| Life records | Tasks, Calendar, Focus, Health, Food, Finance, People, Habits, Goals, Journal, Library |
| System | Insights, Settings |

## Route Inventory

| Route | Page name | Source component | Purpose |
|---|---|---|---|
| `/` | Home redirect | `src/app/page.tsx` | Redirects immediately to `/dashboard`. |
| `/sign-in` | Sign in | `AuthForm` | Email/password login. |
| `/sign-up` | Create account | `AuthForm` | Account creation with display name, email, and password. |
| `/dashboard` | Today | `DashboardHome` | Main daily command center. |
| `/plan` | Plan | `PlanPage` | Weekly planning and recommended actions. |
| `/review` | Review | `ReviewPage` | Morning, evening, and weekly reflection workflow. |
| `/inbox` | Inbox | `InboxPage` | Triage queue for stale, overdue, or unprocessed records. |
| `/command` | Command | `CommandPage` | One-line quick add across Orbit record types. |
| `/search` | Search | `SearchPage` | Global search across saved Orbit data. |
| `/insights` | Insights | `InsightsPage` | Trends, summaries, and lightweight charts. |
| `/tasks` | Tasks | `TasksPage` / `TaskManager` | Full task and reminder management. |
| `/calendar` | Calendar | `CalendarPage` | Two-week agenda and `.ics` export. |
| `/focus` | Focus | `FocusPage` / `FocusPanel` | Plan and log focus blocks. |
| `/health` | Health | `HealthPage` / `HealthPanel` | Manual meal, weight, workout, and sleep logging. |
| `/food` | Food | `FoodPage` / `FoodPanel` | Meal planning and groceries. |
| `/finance` | Finance | `FinancePage` / `FinancePanel` | Expenses, bills, subscriptions, and money logs. |
| `/people` | People | `PeoplePage` / `PeoplePanel` | Relationship follow-ups, birthdays, and notes. |
| `/habits` | Habits | `HabitsPage` / `HabitsPanel` | Routine tracking and check-ins. |
| `/goals` | Goals | `GoalsPage` / `GoalsPanel` | Long-term goals and milestones. |
| `/journal` | Journal | `JournalPage` / `JournalPanel` | Daily mood and reflection entries. |
| `/library` | Library | `LibraryPage` / `LibraryPanel` | Saved links, notes, screenshots, and captures. |
| `/settings` | Settings | `SettingsPage` / `SettingsPanel` | Preferences, notifications, install, backups, privacy, and account controls. |
| `/share-target` | Save shared item | `ShareTargetPage` | PWA share-target review/save flow. |
| Any missing route | 404 | `src/app/not-found.tsx` | Branded not-found page with Today/Search actions. |

## Non-UI Routes

These routes exist in the codebase, but they are not pages a designer needs to mock as screens:

| Route | Source | What it does |
|---|---|---|
| `/api/account/delete` | `src/app/api/account/delete/route.ts` | Authenticated account deletion endpoint used from Settings. |
| `/api/reminders/send` | `src/app/api/reminders/send/route.ts` | Cron/server endpoint that sends due reminder push notifications. |
| `/api/readiness/server` | `src/app/api/readiness/server/route.ts` | Server readiness endpoint surfaced inside the Settings device readiness panel. |
| `/robots.txt` | `src/app/robots.ts` | Blocks indexing for the private app. |

## Page Details

### `/`

The root route redirects to `/dashboard`.

Design notes:

- No full page design is needed unless adding a transition/loading state.

### `/sign-in`

Sources:

- `src/app/(auth)/sign-in/page.tsx`
- `src/components/auth-form.tsx`

What it does:

- Shows the Orbit brand.
- Lets the user sign in with email and password.
- Shows loading state while submitting.
- Shows Supabase auth errors.
- Links to account creation.
- Falls back to setup-required UI when Supabase env vars are missing.

Design notes:

- Keep it centered, simple, and trustworthy.
- Make errors clear and calm.
- Must work well on narrow mobile screens.

### `/sign-up`

Sources:

- `src/app/(auth)/sign-up/page.tsx`
- `src/components/auth-form.tsx`

What it does:

- Shows the Orbit brand.
- Lets the user create an account with display name, email, and password.
- Shows confirmation copy if email confirmation is required.
- Links back to sign in.
- Falls back to setup-required UI when Supabase env vars are missing.

Design notes:

- Match sign-in styling.
- Account creation should feel lightweight, secure, and private.

### `/dashboard` - Today

Sources:

- `src/app/(app)/dashboard/page.tsx`
- `src/components/dashboard-home.tsx`

What it does:

- Main command center for the day.
- Shows a Daily brief with highest-priority actions across tasks, reminders, health, food, money, and people.
- Shows stat tiles for open tasks, due reminders, focus today, meals planned, follow-ups, today spend, active goals, and habits done.
- Shows setup/onboarding progress.
- Shows configurable dashboard widgets from user preferences.
- Can show attention items, compact task manager, quick capture, due reminders, upcoming calendar items, health today, weekly review, insights preview, goals, food, finance, people, focus, habits, journal, and library.
- Header actions link to Inbox, Plan, Review, Command, and Capture.
- Due reminders can be snoozed from the dashboard.

Design notes:

- This is the most important screen.
- It must answer: "What needs my attention today?"
- Daily brief and due reminders should have the strongest hierarchy.
- Quick capture must be easy to reach.
- Widgets should be modular without becoming visually noisy.

### `/plan`

Sources:

- `src/app/(app)/plan/page.tsx`
- `src/components/plan-page.tsx`

What it does:

- Weekly planning page.
- Shows the week date range.
- Header links to Review and Calendar.
- Shows stat tiles for due items, focus, training left, meals planned, groceries, people, average sleep, bills due, habits behind, and goal deadlines.
- Shows a day-by-day Week execution map.
- Shows Recommended actions.
- Shows Next scheduled items.
- Shows side modules for workload, focus plan, food plan, people plan, health targets, money plan, and review coverage.

Design notes:

- Should feel like a calm weekly control room.
- Make overloaded days and gaps obvious.
- Recommended actions should feel specific and actionable.

### `/review`

Sources:

- `src/app/(app)/review/page.tsx`
- `src/components/review-page.tsx`

What it does:

- Review workflow with morning, evening, and weekly modes.
- Uses a segmented control to switch mode.
- Shows readiness score and review metrics.
- Shows review actions based on current data.
- Shows reflection prompts.
- Lets the user save a reflection to the journal.
- Shows tomorrow handoff.
- Shows highlights and gaps.
- Links to Calendar and Journal.

Design notes:

- Should feel reflective but efficient.
- Readiness, prompts, and save reflection flow need clear priority.
- Modes should be visually easy to distinguish.

### `/inbox`

Sources:

- `src/app/(app)/inbox/page.tsx`
- `src/components/inbox-page.tsx`

What it does:

- Triage center for loose, stale, overdue, or unprocessed records.
- Groups issues across tasks, reminders, captures, focus, food, people, health, finance, habits, goals, and journal.
- Shows count tiles for each group.
- Shows grouped triage cards.
- Rows can include inline actions such as complete task, create task from capture, create reminder from capture, acknowledge reminder, snooze reminder, cancel focus, skip meal plan, buy grocery, mark person contacted, pay bill, and add habit log.
- Each row can link back to the source page.

Design notes:

- Should feel like an actionable cleanup queue.
- Inline actions must be readable and easy to tap.
- Severity should be clear without creating anxiety.

### `/command`

Sources:

- `src/app/(app)/command/page.tsx`
- `src/components/command-page.tsx`

What it does:

- One-line quick add for many Orbit record types.
- Supports prefixes including `task:`, `reminder:`, `capture:`, `meal:`, `mealplan:`, `grocery:`, `person:`, `workout:`, `weight:`, `sleep:`, `focus:`, `expense:`, `bill:`, `habit:`, `goal:`, and `journal:`.
- Supports optional tokens like `#tags`, `!priority`, `@due`, `~reminder`, recurrence, calories/macros, grocery quantity, bill recurrence, and autopay.
- Shows live parsed preview.
- Shows clickable examples that populate the input.

Design notes:

- Should feel fast, keyboard-first, and powerful.
- The parsed preview should make the command understandable.
- Examples should help without overwhelming the page.

### `/search`

Sources:

- `src/app/(app)/search/page.tsx`
- `src/components/search-page.tsx`

What it does:

- Global search across Orbit data.
- Search input uses autofocus.
- Has a type filter dropdown.
- Results link back to source pages.
- Results show title, detail, type badge, and tags.
- Empty state explains what can be searched.

Design notes:

- Search field should be visually dominant.
- Results should be dense and easy to scan.
- Filters should feel quick, not heavy.

### `/insights`

Sources:

- `src/app/(app)/insights/page.tsx`
- `src/components/insights-page.tsx`

What it does:

- Trend and analytics page.
- Shows summary tiles for average calories, workout minutes, month spend, bills due, average sleep, focus, goal progress, and latest weight.
- Shows compact bar charts for calories, planned calories, workout minutes, focus, spending, sleep, routines, and mood.
- Shows next-action links to update source data.

Design notes:

- Should feel analytical but personal.
- Charts should be compact and legible.
- Empty or sparse data states should help the user know what to log next.

### `/tasks`

Sources:

- `src/app/(app)/tasks/page.tsx`
- `src/components/tasks-page.tsx`
- `src/components/task-manager.tsx`

What it does:

- Full task manager.
- Add task form includes title, notes, due date/time, reminder date/time, priority, recurrence, and tags.
- Task list supports search, tag filter, open/done grouping, complete task, and reopen task.
- Standalone reminder form includes title, body, and reminder date/time.
- Scheduled reminders list supports snooze and cancel.

Design notes:

- Due date and reminder date are separate concepts and must be visually clear.
- Task status and priority need strong row treatment.
- Standalone reminders should not feel hidden.

### `/calendar`

Sources:

- `src/app/(app)/calendar/page.tsx`
- `src/components/calendar-page.tsx`

What it does:

- Two-week agenda.
- Aggregates dated records from tasks, reminders, meals, planned meals, groceries, people, workouts, weight, sleep, focus, expenses, bills, journal, and goals.
- Shows event count tiles by type.
- Shows one card per day.
- Each event links to its source page.
- Can export the visible agenda as an `.ics` file.

Design notes:

- Needs excellent date scanning.
- Event types should be distinct without too much color.
- Export should be available but secondary.

### `/focus`

Sources:

- `src/app/(app)/focus/page.tsx`
- `src/components/focus-page.tsx`
- `src/components/focus-panel.tsx`

What it does:

- Plans or logs focused work blocks.
- Form supports Completed and Planned modes.
- Fields include title, duration, start date/time, linked task, energy, tags, and note.
- Shows focus summary and focus session list.
- Inline actions can complete planned sessions or cancel planned sessions.

Design notes:

- Should connect time spent to execution.
- Planned and completed sessions need clear status treatment.
- Keep logging fast on mobile.

### `/health`

Sources:

- `src/app/(app)/health/page.tsx`
- `src/components/health-page.tsx`
- `src/components/health-panel.tsx`

What it does:

- Manual health logging.
- Header links to Food.
- Log form supports Meal, Weight, Workout, and Sleep modes.
- Meal logging includes calories and macros.
- Weight logging uses the preferred unit.
- Workout logging includes type, duration, calories, and notes.
- Sleep logging includes date, duration, quality, and notes.
- Shows recent health history.
- Uses user preferences for calorie, macro, weight unit, and workout targets.

Design notes:

- Mode switcher is important.
- Health should feel practical, not intense.
- Logging should be fast from mobile.

### `/food`

Sources:

- `src/app/(app)/food/page.tsx`
- `src/components/food-page.tsx`
- `src/components/food-panel.tsx`

What it does:

- Meal planning and grocery page.
- Header links to Health.
- Form supports Planned meal and Grocery item modes.
- Planned meal fields include name, date, meal type, calories/macros, tags, and note.
- Grocery fields include name, category, quantity, due date, linked meal, and tags.
- Shows planned meals.
- Shows meals missing groceries.
- Shows grocery list grouped by shopping category.
- Inline actions can mark meal prepped, mark meal eaten, skip meal, and mark grocery bought.

Design notes:

- Meals and groceries should feel connected.
- Grocery list needs strong mobile usability.
- Meal statuses should be clear at a glance.

### `/finance`

Sources:

- `src/app/(app)/finance/page.tsx`
- `src/components/finance-page.tsx`
- `src/components/finance-panel.tsx`

What it does:

- Money tracking page.
- Form supports Expense and Bill modes.
- Expense fields include merchant/title, amount, currency, category, date/time, tags, and note.
- Bill fields include name, amount, currency, category, due date, recurrence, autopay, tags, and note.
- Shows money summary, expenses, and bills/subscriptions.
- Inline actions include marking bills paid and advancing recurring bills.

Design notes:

- Should be calm and ledger-like.
- Bills due or overdue need clear priority.
- Expense and bill modes should be visually distinct.

### `/people`

Sources:

- `src/app/(app)/people/page.tsx`
- `src/components/people-page.tsx`
- `src/components/people-panel.tsx`

What it does:

- Relationship tracker.
- Add person form includes name, relationship, contact method, birthday, next follow-up, favorite, and notes.
- Shows people summary, due follow-ups, birthdays, and favorite people.
- Inline actions can toggle favorite, mark contacted and set next follow-up, or clear follow-up.

Design notes:

- Should feel personal and respectful, not CRM-like.
- Follow-up urgency should be visible but gentle.
- Birthdays and favorites should feel warm without decoration overload.

### `/habits`

Sources:

- `src/app/(app)/habits/page.tsx`
- `src/components/habits-page.tsx`
- `src/components/habits-panel.tsx`

What it does:

- Routine tracker.
- Add habit form includes name, frequency, target count, and color.
- Shows active habits.
- Shows habit progress and current momentum.
- Inline actions can check in or archive.

Design notes:

- Show momentum without pressure.
- Avoid loud streak visuals.
- Check-in should be one tap.

### `/goals`

Sources:

- `src/app/(app)/goals/page.tsx`
- `src/components/goals-page.tsx`
- `src/components/goals-panel.tsx`

What it does:

- Long-term outcome tracker.
- Add goal form includes title, notes, target date, and initial milestones.
- Shows active goals.
- Shows progress based on milestones.
- Allows adding milestones inline.
- Inline actions can complete/reopen milestones, complete/reopen goals, and archive goals.

Design notes:

- Goals should feel outcome-oriented, not like another task list.
- Milestones need clear progress visualization.
- Completed state should still feel recoverable.

### `/journal`

Sources:

- `src/app/(app)/journal/page.tsx`
- `src/components/journal-page.tsx`
- `src/components/journal-panel.tsx`

What it does:

- Daily reflection page.
- Today journal form includes mood, title, and body.
- Saves or updates today's journal entry.
- Shows recent entries.
- Shows 7-day mood context.

Design notes:

- Should feel lightweight and private.
- Mood selection should be quick.
- Recent entries should be readable.

### `/library`

Sources:

- `src/app/(app)/library/page.tsx`
- `src/components/library-page.tsx`
- `src/components/library-panel.tsx`
- `src/components/quick-capture.tsx`

What it does:

- Saved material and capture manager.
- Quick capture supports link, note, and screenshot.
- Capture fields include title, URL, note, tags, and image upload for screenshots.
- Supports paste, drop, and file-select images.
- Saves captures offline if the device is offline.
- Recent saves support search, type filter, source filter, tag filter, attachment opening, create task from capture, remind tomorrow, copy URL, and delete capture.

Design notes:

- Capture must feel extremely fast.
- Recent saves should support browsing and filtering.
- Screenshot/file states need clear affordances.

### `/settings`

Sources:

- `src/app/(app)/settings/page.tsx`
- `src/components/settings-page.tsx`
- `src/components/settings-panel.tsx`
- `src/components/pwa-install-panel.tsx`
- `src/components/offline-queue-panel.tsx`
- `src/components/device-readiness.tsx`

What it does:

- Manages preferences: display name, timezone, weight unit, calorie target, macro targets, weekly workout target, and dashboard module toggles.
- Manages account export/import: full JSON backup, CSV bundle export, backup import, and backup health summary.
- Provides destructive account deletion with `DELETE` confirmation.
- Shows PWA install status and install help.
- Shows offline queue with queued captures, sync, rescue export/import, and discard actions.
- Shows browser capture bookmarklet and copy action.
- Manages Web Push notifications: permission status, enable push, test notification, disable push.
- Shows local privacy tools: hide app and clear local browser state.
- Shows device readiness checks for network, secure context, install mode, service worker, offline shell, app shell cache, offline queue, push support, manifest, backup download support, and server checks.

Design notes:

- This is utility-heavy and needs strong sectioning.
- Destructive actions must be visually separated.
- Notification, install, backup, and readiness states need clear feedback.
- Avoid making this feel like a wall of settings.

### `/share-target`

Sources:

- `src/app/(app)/share-target/page.tsx`
- `src/components/share-target-page.tsx`
- `src/components/quick-capture.tsx`

What it does:

- Receives content shared from another app through the PWA share target.
- Reads shared title, text, URL, and image files.
- Normalizes shared data into a capture draft.
- Lets the user review and save it through Quick Capture.
- Removes stored share payload after saving.
- Shows an error if shared files cannot be loaded.

Design notes:

- User arrived from another app, so this should be minimal and fast.
- Preview/edit needs to be clear.
- Saving should be the dominant action.

### 404

Source:

- `src/app/not-found.tsx`

What it does:

- Shows branded Orbit not-found panel.
- Explains that the link may be old or moved.
- Offers actions to go to Today or Search.

Design notes:

- Keep it simple and consistent with auth/setup surfaces.

## Shared Components To Design

Design these reusable patterns once, then apply across the app:

- App shell with desktop sidebar, mobile top bar, and mobile bottom nav.
- Page header with title, subtitle, and action area.
- Module card.
- Priority module card.
- Entry/logging module card.
- Stat tile.
- List row with title, metadata, badges, and inline actions.
- Empty state.
- Loading skeleton.
- Notice, success, and error states.
- Segmented control.
- Search input.
- Filter select.
- Tag badges.
- Form field groups.
- Icon buttons.
- Inline action buttons.
- Destructive action area.
- Offline/status banner.
- Privacy shield overlay.
- Mobile-friendly dense rows.

## Reused Full-Page Panels

Several components work both as full pages and as compact dashboard widgets:

| Component | Full page | Dashboard usage |
|---|---|---|
| `TaskManager` | `/tasks` | Compact Today widget |
| `HealthPanel` | `/health` | Health widget |
| `FoodPanel` | `/food` | Food widget |
| `FinancePanel` | `/finance` | Finance widget |
| `FocusPanel` | `/focus` | Focus widget |
| `PeoplePanel` | `/people` | People widget |
| `HabitsPanel` | `/habits` | Habits widget |
| `GoalsPanel` | `/goals` | Goals widget |
| `JournalPanel` | `/journal` | Journal widget |
| `LibraryPanel` | `/library` | Quick capture/library widget |

Design implication:

- Components need a full-page version and a compact widget version.
- Compact mode should preserve core actions while reducing visual density.

## Priority Screens

Design these first because they define the product experience:

1. `/dashboard` - Today
2. `/plan` - Plan
3. `/review` - Review
4. `/inbox` - Inbox
5. `/command` - Command

Then design the record-management pages:

1. `/tasks`
2. `/calendar`
3. `/focus`
4. `/health`
5. `/food`
6. `/finance`
7. `/people`
8. `/habits`
9. `/goals`
10. `/journal`
11. `/library`

Then design the system pages:

1. `/search`
2. `/insights`
3. `/settings`
4. `/share-target`
5. `/sign-in`
6. `/sign-up`
7. 404

## Design Direction

Orbit should look and feel like a premium personal control room:

- White and cool-neutral surfaces.
- Restrained cobalt/indigo accents.
- Clear status colors for success, warning, danger, and priority.
- Compact typography with strong legibility.
- Dense but breathable spacing.
- Minimal decoration.
- Cards only for real modules, not every section.
- Clear hover, focus, active, disabled, loading, empty, and error states.
- Excellent mobile tap targets.
- Strong keyboard accessibility.

## Questions For The Design Agent

Use these questions to guide design decisions:

1. Can the user understand what needs attention today within five seconds?
2. Can every logging flow be completed quickly on mobile?
3. Are due dates, reminder times, and scheduled items visually distinct?
4. Are status and urgency clear without making the app feel stressful?
5. Can repeated modules share one design language without every page looking identical?
6. Does the interface feel private and personal rather than corporate?
7. Are offline, notification, install, backup, and destructive states clear enough to trust?
