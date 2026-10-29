"""Claude reads the numeric WHOOP summary and writes a short summary and recommendations in Arabic.

Only the computed numbers are sent (no names, emails or WHOOP ids). Needs ORBIT_ANTHROPIC_API_KEY.
"""

import json
from typing import Any

import anthropic
from pydantic import BaseModel, Field

from app.config import get_settings


class InsightUnavailable(Exception):
    """The AI summary can't be written right now; the message is safe to show in the app."""


class Insight(BaseModel):
    summary: str = Field(description="Three to five short sentences in Arabic about how the period went.")
    highlights: list[str] = Field(description="Two to five short Arabic bullet points, each tied to a number from the data.")
    recommendations: list[str] = Field(description="Two to four practical Arabic recommendations for the coming days.")


SYSTEM = """You are the health coach inside Orbit, a personal life dashboard. The user wears a WHOOP band.
You get a JSON summary of their WHOOP data: one row per day (recovery %, HRV in ms, resting heart rate, \
day strain on WHOOP's 0-21 scale, sleep hours, sleep performance/efficiency/consistency %, respiratory rate, \
workouts), averages for the whole period and for the last 7 days against the 7 before, recovery zone counts \
(green >= 67, yellow 34-66, red < 34), workouts by sport, and the average recovery after hard days.

Write in simple, warm Arabic that a Saudi reader finds natural. Short sentences. No jargon: if you use a term \
like HRV, say what it means in a few plain words the first time. Write numbers as Western digits (72%, 6.5).
Ground every point in the numbers you were given; never invent data. If some days have no data, work with what is there \
and do not dwell on the gaps. Mention a trend only when the change is clear.
This is wellness guidance, not medical advice: don't diagnose. If a number looks worrying (for example resting heart rate \
rising for many days with falling HRV), suggest rest and, if it continues, talking to a doctor."""


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=get_settings().anthropic_api_key, max_retries=2, timeout=120.0)


def ai_configured() -> bool:
    return bool(get_settings().anthropic_api_key)


def write_insight(summary: dict[str, Any]) -> tuple[Insight, str]:
    """Returns the insight and the model that wrote it."""
    if not ai_configured():
        raise InsightUnavailable("The AI summary isn't set up on this server (ANTHROPIC_API_KEY).")
    model = get_settings().insights_model
    data = json.dumps(summary, ensure_ascii=False, separators=(",", ":"))
    try:
        response = _client().beta.messages.parse(
            model=model,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": f"My WHOOP data for {summary['start']} to {summary['end']}:\n{data}"}],
            output_config={"effort": "medium"},
            output_format=Insight,
            # If a safety check declines the request, let the API retry it on its recommended model.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
    except anthropic.AuthenticationError as exc:
        raise InsightUnavailable("The Anthropic API key on the server was refused.") from exc
    except anthropic.RateLimitError as exc:
        raise InsightUnavailable("Claude is busy right now. Try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        raise InsightUnavailable(f"Claude answered with an error ({exc.status_code}). Try again later.") from exc
    except anthropic.APIConnectionError as exc:
        raise InsightUnavailable("Can't reach Claude from the server. Try again later.") from exc
    if response.stop_reason == "refusal":
        raise InsightUnavailable("Claude declined to write this summary.")
    if response.parsed_output is None:
        raise InsightUnavailable("Claude's answer was cut off. Try again.")
    return response.parsed_output, response.model
