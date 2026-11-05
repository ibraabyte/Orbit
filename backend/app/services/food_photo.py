"""Estimates what's on a plate from a photo, with the user's own AI (the same connection as the WHOOP summary).

The answer is a draft: the app shows it and the user fixes and confirms the items before anything is saved.
The photo is sent to the AI provider once and never stored on the server.
"""

import json
from typing import Any

from pydantic import ValidationError

from app.config import get_settings
from app.schemas.food import PlateEstimate, PlateItem
from app.services import whoop_ai
from app.services.whoop_ai import AiAccess, ChatgptAccess, InsightUnavailable

SYSTEM = """You estimate food and nutrition from a photo for Orbit, a personal food log. The user lives in Saudi Arabia, \
so expect Saudi and Gulf dishes (kabsa, mandi, mathbi, jareesh, saleeg, margoog, shawarma, dates, Arabic coffee) next to \
international food.

List each separate food you can see, with its visible portion, an estimated weight in grams, and the calories and \
macronutrients for that portion. Base the numbers on typical recipes: for rice dishes like kabsa or mandi, count the oil \
or ghee usually cooked in, and split rice and meat into separate items. Use the plate, hand or cutlery for scale.
If the user adds a note, trust it over what you see. Give names in plain English (use the dish's usual name, e.g. 'Chicken kabsa rice').
These are honest estimates for personal tracking, not medical advice; mark confidence low when the portion is hard to judge.
If the photo shows no food, return no items and say so in the note."""


def _prompt(note: str | None) -> str:
    text = "Estimate the food in this photo."
    return f"{text}\nMy note about it: {note.strip()}" if note and note.strip() else text


def _clean(estimate: PlateEstimate) -> PlateEstimate:
    # Models can still slip a negative or absurd number in; keep what the app shows sane.
    items = []
    for item in estimate.items[:12]:

        def fix(value: float | None, top: float) -> float | None:
            return None if value is None or value < 0 else round(min(value, top), 1)

        items.append(
            PlateItem(
                name=item.name.strip()[:220] or "Food",
                portion=item.portion.strip()[:80] or "1 serving",
                grams=fix(item.grams, 5000) or None,
                calories=fix(item.calories, 10000) or 0,
                protein_g=fix(item.protein_g, 1000),
                carbs_g=fix(item.carbs_g, 1000),
                fat_g=fix(item.fat_g, 1000),
                confidence=item.confidence,
            )
        )
    return PlateEstimate(items=items, note=estimate.note.strip()[:500])


def _with_claude(access: AiAccess, image: str, media_type: str, note: str | None) -> tuple[PlateEstimate, str]:
    extras: dict[str, Any] = {}
    if access.model == get_settings().insights_model:
        extras = {"output_config": {"effort": "low"}, "betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
    content = [
        {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image}},
        {"type": "text", "text": _prompt(note)},
    ]
    response = whoop_ai._call_anthropic(
        lambda: whoop_ai._anthropic(access.api_key).beta.messages.parse(
            model=access.model,
            max_tokens=16000,
            system=SYSTEM,
            messages=[{"role": "user", "content": content}],
            output_format=PlateEstimate,
            **extras,
        )
    )
    if response.stop_reason == "refusal":
        raise InsightUnavailable("Claude declined to read this photo.")
    if response.parsed_output is None:
        raise InsightUnavailable("Claude's answer was cut off. Try again.")
    return response.parsed_output, response.model


def _parse(text: str, who: str) -> PlateEstimate:
    try:
        return PlateEstimate.model_validate_json(text[text.index("{") : text.rindex("}") + 1])
    except (TypeError, ValueError, ValidationError) as exc:
        raise InsightUnavailable(f"{who}'s answer wasn't a usable estimate. Try again, or try another photo.") from exc


def _chat_messages(image: str, media_type: str, note: str | None, system: str) -> list[dict[str, Any]]:
    return [
        {"role": "system", "content": system},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": _prompt(note)},
                {"type": "image_url", "image_url": {"url": f"data:{media_type};base64,{image}"}},
            ],
        },
    ]


def _with_chat(access: AiAccess, image: str, media_type: str, note: str | None) -> tuple[PlateEstimate, str]:
    schema = PlateEstimate.model_json_schema()
    system = f"{SYSTEM}\n\nAnswer with one JSON object matching this schema, and nothing else:\n{json.dumps(schema)}"
    answer = whoop_ai._chat(
        access,
        {
            "messages": _chat_messages(image, media_type, note, system),
            "response_format": {"type": "json_schema", "json_schema": {"name": "plate", "strict": True, "schema": schema}},
        },
    )
    try:
        content = answer["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise InsightUnavailable("The AI's answer wasn't a usable estimate. Try again.") from exc
    return _parse(content, "The AI"), answer.get("model") or access.model


def _with_chatgpt(access: ChatgptAccess, image: str, media_type: str, note: str | None) -> tuple[PlateEstimate, str]:
    from app.services import chatgpt_ai, chatgpt_auth

    schema = json.dumps(PlateEstimate.model_json_schema())
    system = f"{SYSTEM}\n\nAnswer with one JSON object matching this schema, and nothing else:\n{schema}"
    try:
        answer = chatgpt_ai.respond(access.db, access.user_id, _chat_messages(image, media_type, note, system))
    except chatgpt_auth.ChatgptError as exc:
        raise InsightUnavailable(str(exc)) from exc
    return _parse(answer.text, "ChatGPT"), answer.model


def estimate(image: str, media_type: str, note: str | None, access: AiAccess | ChatgptAccess) -> tuple[PlateEstimate, str]:
    """Returns the cleaned estimate and the model that made it."""
    if isinstance(access, ChatgptAccess):
        found, model = _with_chatgpt(access, image, media_type, note)
    elif access.provider == "anthropic":
        found, model = _with_claude(access, image, media_type, note)
    else:
        found, model = _with_chat(access, image, media_type, note)
    return _clean(found), model
