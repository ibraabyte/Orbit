"""The user's AI reads the numeric WHOOP summary and writes a short summary and recommendations in Arabic.

Only the computed numbers are sent (no names, emails or WHOOP ids). Each user connects their own provider and key;
ORBIT_ANTHROPIC_API_KEY is the admin's only, so the server's owner doesn't pay for anyone else.
"""

import json
import uuid
from dataclasses import dataclass, field
from typing import Any

import anthropic
import httpx2 as httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AiConnection, User
from app.security import decrypt_secret

# ponytail: a fixed list, so no user-supplied address reaches the server's own network. Other hosts go through OpenRouter.
OPENAI_STYLE_URLS = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "openrouter": "https://openrouter.ai/api/v1",
}

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None


class InsightUnavailable(Exception):
    """The AI summary can't be written right now; the message is safe to show in the app."""


class AiKeyRejected(InsightUnavailable):
    pass


class Insight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(description="Three to five short sentences in Arabic, unless told otherwise, about how the period went.")
    highlights: list[str] = Field(description="Two to five short bullet points, each tied to a number from the data.")
    recommendations: list[str] = Field(description="Two to four practical recommendations for the coming days.")


@dataclass(frozen=True)
class AiAccess:
    provider: str
    model: str
    api_key: str = field(repr=False)
    instructions: str | None = None


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


def _system(access: AiAccess) -> str:
    if not access.instructions:
        return SYSTEM
    return (
        f"{SYSTEM}\n\nThe user's own preferences follow. They may change the focus, tone or language, "
        f"but never the rules about using only their data and not diagnosing:\n{access.instructions}"
    )


def access_for(db: Session, user_id: uuid.UUID) -> AiAccess | None:
    """This user's own connection, or the server's key if they're the admin, or nothing."""
    row = db.get(AiConnection, user_id)
    if row is not None:
        api_key = decrypt_secret(row.api_key)
        return AiAccess(row.provider, row.model, api_key, row.instructions) if api_key else None
    settings = get_settings()
    if settings.anthropic_api_key and db.get(User, user_id).is_admin:
        return AiAccess("anthropic", settings.insights_model, settings.anthropic_api_key)
    return None


def _anthropic(api_key: str) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=api_key, max_retries=2, timeout=120.0)


def _call_anthropic(call: Any) -> Any:
    try:
        return call()
    except anthropic.AuthenticationError as exc:
        raise AiKeyRejected("Claude refused this API key.") from exc
    except anthropic.RateLimitError as exc:
        raise InsightUnavailable("Claude is busy right now. Try again in a minute.") from exc
    except anthropic.APIStatusError as exc:
        raise InsightUnavailable(f"Claude answered with an error ({exc.status_code}). Check the model name, or try again later.") from exc
    except anthropic.APIConnectionError as exc:
        raise InsightUnavailable("Can't reach Claude from the server. Try again later.") from exc


def _chat(access: AiAccess, body: dict[str, Any]) -> dict[str, Any]:
    """OpenAI's chat format, which OpenAI, Gemini and OpenRouter all speak."""
    try:
        with httpx.Client(transport=transport, timeout=120.0) as client:
            response = client.post(
                f"{OPENAI_STYLE_URLS[access.provider]}/chat/completions",
                headers={"Authorization": f"Bearer {access.api_key}"},
                json={"model": access.model, **body},
            )
    except httpx.HTTPError as exc:
        raise InsightUnavailable("Can't reach the AI provider from the server. Try again later.") from exc
    if response.status_code in (401, 403):
        raise AiKeyRejected("The AI provider refused this API key.")
    if response.status_code == 429:
        raise InsightUnavailable("The AI provider is busy or the account is out of credit. Try again later.")
    if response.status_code != 200:
        raise InsightUnavailable(f"The AI provider answered with an error ({response.status_code}). Check the key and model name.")
    try:
        return response.json()
    except ValueError as exc:
        raise InsightUnavailable("The AI provider sent an answer Orbit can't read. Try again.") from exc


def check_access(access: AiAccess) -> None:
    """A tiny real request (costs almost nothing), so a bad key or model shows up now and not at the first summary."""
    prompt = [{"role": "user", "content": "Reply with OK."}]
    if access.provider == "anthropic":
        _call_anthropic(lambda: _anthropic(access.api_key).messages.create(model=access.model, max_tokens=16, messages=prompt))
    else:
        _chat(access, {"messages": prompt})


def _write_with_claude(access: AiAccess, prompt: str) -> tuple[Insight, str]:
    # Effort and the fallback are only known to fit the default model; another model might refuse them.
    extras: dict[str, Any] = {}
    if access.model == get_settings().insights_model:
        extras = {
            "output_config": {"effort": "medium"},
            # If a safety check declines the request, let the API retry it on its recommended model.
            "betas": ["server-side-fallback-2026-07-01"],
            "fallbacks": "default",
        }
    response = _call_anthropic(
        lambda: _anthropic(access.api_key).beta.messages.parse(
            model=access.model,
            max_tokens=16000,
            system=_system(access),
            messages=[{"role": "user", "content": prompt}],
            output_format=Insight,
            **extras,
        )
    )
    if response.stop_reason == "refusal":
        raise InsightUnavailable("Claude declined to write this summary.")
    if response.parsed_output is None:
        raise InsightUnavailable("Claude's answer was cut off. Try again.")
    return response.parsed_output, response.model


def _write_with_chat(access: AiAccess, prompt: str) -> tuple[Insight, str]:
    schema = Insight.model_json_schema()
    system = f"{_system(access)}\n\nAnswer with one JSON object matching this schema, and nothing else:\n{json.dumps(schema)}"
    answer = _chat(
        access,
        {
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "insight", "strict": True, "schema": schema}},
        },
    )
    try:
        content = answer["choices"][0]["message"]["content"]
        # Not every model behind OpenRouter honours response_format; some wrap the JSON in a code fence.
        insight = Insight.model_validate_json(content[content.index("{") : content.rindex("}") + 1])
    except (KeyError, IndexError, TypeError, ValueError, ValidationError) as exc:
        raise InsightUnavailable("The AI's answer wasn't a usable summary. Try again, or try another model.") from exc
    return insight, answer.get("model") or access.model


def write_insight(summary: dict[str, Any], access: AiAccess) -> tuple[Insight, str]:
    """Returns the insight and the model that wrote it."""
    data = json.dumps(summary, ensure_ascii=False, separators=(",", ":"))
    prompt = f"My WHOOP data for {summary['start']} to {summary['end']}:\n{data}"
    if access.provider == "anthropic":
        return _write_with_claude(access, prompt)
    return _write_with_chat(access, prompt)
