# Orbit Backlog

The Expo app. The web/PWA backlog is in git at the tag `web-final`.

## Waiting on the owner

- Try the app on the phone in Expo Go (`npm start`, scan the QR code).
- Server for the database move: provider, OS, RAM (4GB+), SSH access, and a subdomain for HTTPS.
  Then follow `deploy/supabase/README.md`; it builds every table, including `0015_vehicles` and `0016_watch_items`.
- Seerr: the server URL, and whether the Seerr account is an admin (needed to approve requests).
  The URL and API key are typed into the app, never sent in chat.
- Apple Developer account, for a real build (TestFlight), home screen widgets, and Apple Health.

## Needs a service key (paused)

- Shipment tracking.
- In-app AI assistant.
- Receipt scanning.

## Engineering follow-ups

- Server checks run only while Orbit is open. Round-the-clock alerts need a scheduled job on the server.
- Car screen: editing a date uses `Alert.prompt`, which is iPhone-only; Android gets one-tap renew only.
- Port the Drift look (see `DESIGN.md`) to the native screens; they use plain iOS styling for now.
- Add component or end-to-end tests once the app runs against the self-hosted database.
- Re-run `npm run verify` after every change.
