# Orbit App Screens

What each screen in the Expo app does, based on `src/app`. The web version's page list
is in git at the tag `web-final`.

Last checked against the code: October 28, 2026.

## Product Summary

Orbit is a private life dashboard for one owner on iPhone (Android builds too). It covers tasks,
reminders, planning and review, focus, health, food, money, people, habits, goals, journaling,
saved links, the car, movies and TV, and home servers.

The app should feel calm, precise and personal: dense enough for daily use, private by default,
not gamified and not a generic SaaS dashboard.

## App Structure

- `src/app/_layout.tsx`: checks the Supabase session. Signed out shows only Sign in. Signed in wraps
  everything in the Face ID lock, the shared data provider, the server checker, and the notification scheduler.
- `src/app/(tabs)/_layout.tsx`: native tab bar with five tabs: Today, Tasks, Plan, Focus, More.
- The rest are stack screens opened from More, with a large title and a back button.
- Offline: the app opens with the last saved copy of the data and says when it was saved. Writes need a connection.

Shared pieces in `src/components`: `Screen` (scroll + pull to refresh), `Section`, `Stats`, `Row`,
`Empty`, `Segments`, the quick-add bar, and the app lock.

## Tabs

| Tab | File | What it shows |
| --- | --- | --- |
| Today | `(tabs)/index.tsx` | Quick-add bar, next prayer time, the day's non-zero numbers (tasks, overdue, reminders, habits, calories, focus minutes), and "Next up" items that link to the right screen. |
| Tasks | `(tabs)/tasks.tsx` | Quick-add bar and open tasks sorted by due date. Overdue in red, high priority in amber. Tap to complete (also clears its reminders). |
| Plan | `(tabs)/plan.tsx` | Three views: **Week** (actions and next 7 days), **Review** (morning, evening, weekly: going well, gaps, actions, tomorrow's handoff, reflect prompts), **Trends** (insights). Replaces the web Plan, Review and Insights pages. |
| Focus | `(tabs)/focus.tsx` | This week's focus totals, planned blocks, and recent sessions. Replaces the web Focus and Momentum pages. |
| More | `(tabs)/more.tsx` | List of the other screens below. |

## Stack Screens

| Screen | File | What it does |
| --- | --- | --- |
| Health | `health.tsx` | Meals (calories, macros), workouts, sleep, weight. |
| Food | `food.tsx` | Meal plans and the grocery list by category. |
| Finance | `finance.tsx` | Bills, a Subscriptions block with the monthly total, spending by category this month, recent expenses. Alerts 3 days before a subscription renews. |
| People | `people.tsx` | Follow-ups, birthdays in the next 30 days, everyone. |
| Habits | `habits.tsx` | Habits with one-tap check-in. |
| Goals | `goals.tsx` | Goals with progress and milestones to tick off. |
| Journal | `journal.tsx` | Entries and mood. |
| Library | `library.tsx` | Saved links and notes with search; tap a link to open it. |
| Car | `vehicles.tsx` | Per car: registration (istimara), insurance, inspection (فحص), oil change, odometer. One-tap renew; editing a date is iPhone-only for now. Alerts before each is due. Needs migration `0015_vehicles.sql`. |
| Movies & TV | `media.tsx` | Watch list (want / watching with season and episode / done), and Seerr: connect with server URL and API key, search or trending, one-tap request, and approve or decline pending requests when the Seerr user is an admin. Needs migration `0016_watch_items.sql`. |
| Servers | `servers.tsx` | Add servers by URL; shows up or down with response time, checked on open and every 5 minutes while the app is open, with an alert when one goes down or comes back. |
| Settings | `settings.tsx` | Signed-in name, Face ID lock on/off, prayer time alerts on/off, sign out. |
| Sign in | `sign-in.tsx` | Email and password. |

## Quick Add

The bar on Today and Tasks takes one line in English or Arabic and makes the right record:
"spent 25 lunch", "نمت 7 ساعات", "call mom tomorrow 9am", "subscription Netflix 45".
Starter chips (spent, slept, workout, weight, buy, note) and recent lines are one tap away.

## Notifications

All scheduled on the phone, so they work offline once set:

- Reminders and task reminders (the soonest 40).
- Subscription renewals (3 days before), car renewals and oil change.
- Prayer times (Umm al-Qura method, from the phone's location, Riyadh if location is off), two days ahead.
- Server down or back up, while the app is open.

Tapping one opens the matching screen. Signing out cancels them all.
