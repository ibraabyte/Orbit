"""The privacy page WHOOP's developer dashboard asks for, and that WHOOP links on its consent screen.

Plain HTML from the API itself, so it lives at a stable address on the same domain as the WHOOP redirect URL.
"""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["legal"])

PRIVACY_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Orbit privacy</title>
<style>
  body { margin: 0; background: #0f2a22; color: #f4efe2; font: 16px/1.6 system-ui, -apple-system, sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  h2 { font-size: 18px; margin: 28px 0 6px; color: #d6f36b; }
  p, li { color: #e4ddcc; }
</style>
</head>
<body>
<main>
<h1>Orbit privacy</h1>
<p>Orbit is a private personal dashboard. Each Orbit server is run by its owner for themselves and the people they
invite. This page explains what an Orbit server does with your data.</p>

<h2>What Orbit keeps</h2>
<ul>
  <li>Your account: email address and a hashed password.</li>
  <li>What you add in the app: tasks, reminders, notes, bank messages you choose
  to forward, and the other lists you keep.</li>
  <li>If you connect WHOOP: your WHOOP user id, your recovery, sleep, cycle (strain) and workout records, and the
  sign-in tokens WHOOP gives Orbit. The tokens are stored encrypted.</li>
  <li>If you connect Seerr: its address and API key, stored encrypted.</li>
</ul>

<h2>How it is used</h2>
<p>Only to show your own data back to you in the Orbit app. Orbit has no ads, no tracking, and never sells or shares
your data. Each account sees only its own data.</p>

<h2>AI summaries</h2>
<p>If you press the button for a written WHOOP summary, Orbit sends the computed numbers for that period (averages,
trends, daily scores) to Anthropic's Claude API to write it. Your name and email are not sent.</p>

<h2>Disconnecting and deleting</h2>
<p>You can disconnect WHOOP in the app at any time. That revokes Orbit's access at WHOOP and deletes the tokens; you
choose whether the synced WHOOP data is kept or deleted. Deleting your Orbit account deletes all of your data on the
server.</p>

<h2>Contact</h2>
<p>Questions go to the owner of the Orbit server you signed up on.</p>
</main>
</body>
</html>
"""


@router.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
def privacy() -> HTMLResponse:
    return HTMLResponse(PRIVACY_HTML)
