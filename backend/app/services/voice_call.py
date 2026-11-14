"""A live voice call with the Orbit assistant, through OpenAI Realtime with the user's own OpenAI key.

The key never leaves the server. For each call the server asks OpenAI for a short-lived client secret (it can only start
one call, within two minutes) with the call's settings fixed in it: the instructions, the voice and the assistant's
tools. The phone then talks to OpenAI over WebRTC with that secret: the audio goes from the phone to OpenAI and back,
never through Orbit, and nothing of it is kept here.

The tools are the text assistant's own (app.services.assistant_actions): find_items and the propose_* tools. When the
model calls one, the phone sends the call here (POST /assistant/call/tool) and gets back the tool's answer and any
proposed change; the change is shown on the call screen and only the user's tap saves it, through the item's own route.

The key used is the user's saved OpenAI key: the voice model's (Integrations > Voice) if it is OpenAI, else the AI's.
"""

import json
import uuid
from dataclasses import dataclass
from typing import Any

import httpx2 as httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.security import decrypt_secret
from app.services import assistant_actions
from app.services.agent import Tool

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None

_CLIENT_SECRETS = "https://api.openai.com/v1/realtime/client_secrets"
MODEL = "gpt-realtime"
# OpenAI's realtime voices. marin and cedar sound the most natural; the first is the default.
VOICES = ("marin", "cedar", "ash", "coral", "sage", "verse")
# The secret only has to start the call; once started, the call itself keeps going.
SECRET_SECONDS = 120
# How many refs the phone may send back with a tool call: the session's items plus what find_items added.
MAX_REFS = 800


class CallUnavailable(Exception):
    """OpenAI couldn't be reached or answered with an error. The message is safe to show."""


class CallKeyRejected(CallUnavailable):
    """OpenAI refused the key."""


@dataclass(frozen=True)
class CallKey:
    api_key: str
    # Where the key is saved: "voice" (Integrations > Voice) or "ai" (Integrations > AI).
    source: str


def call_key(db: Session, user_id: uuid.UUID) -> CallKey | None:
    """The user's own OpenAI key, or None when they saved none."""
    voice = db.get(m.VoiceConnection, user_id)
    if voice is not None and voice.provider == "openai":
        key = decrypt_secret(voice.api_key)
        if key:
            return CallKey(key, "voice")
    ai = db.get(m.AiConnection, (user_id, "openai"))
    if ai is not None:
        key = decrypt_secret(ai.api_key)
        if key:
            return CallKey(key, "ai")
    return None


def realtime_tools(tools: list[Tool]) -> list[dict[str, Any]]:
    return [{"type": "function", "name": t.name, "description": t.description, "parameters": t.parameters} for t in tools]


def session_config(instructions: str, voice: str, language: str, tools: list[Tool]) -> dict[str, Any]:
    return {
        "expires_after": {"anchor": "created_at", "seconds": SECRET_SECONDS},
        "session": {
            "type": "realtime",
            "model": MODEL,
            "instructions": instructions,
            "output_modalities": ["audio"],
            "audio": {
                "input": {
                    # The words the user said, shown as captions on the call screen.
                    "transcription": {"model": "gpt-4o-mini-transcribe", "language": language},
                    "noise_reduction": {"type": "near_field"},
                    # The model hears when the user has finished, and stops talking when the user talks over it.
                    "turn_detection": {"type": "semantic_vad", "create_response": True, "interrupt_response": True},
                },
                "output": {"voice": voice},
            },
            "tools": realtime_tools(tools),
            "tool_choice": "auto",
        },
    }


def client_secret(api_key: str, config: dict[str, Any]) -> dict[str, Any]:
    """A secret that starts one call with these settings: {"value": ..., "expires_at": unix seconds}."""
    try:
        with httpx.Client(transport=transport, timeout=30.0) as client:
            response = client.post(_CLIENT_SECRETS, headers={"Authorization": f"Bearer {api_key}"}, json=config)
    except httpx.HTTPError as exc:
        raise CallUnavailable("Can't reach OpenAI from the server. Try again later.") from exc
    if response.status_code in (401, 403):
        raise CallKeyRejected("OpenAI refused this API key, or the key can't use realtime voice.")
    if response.status_code == 429:
        raise CallUnavailable("OpenAI is busy or the account is out of credit. Try again later.")
    if response.status_code != 200:
        raise CallUnavailable(f"OpenAI answered with an error ({response.status_code}). Try again later.")
    try:
        body = response.json()
        value = body.get("value") or (body.get("client_secret") or {}).get("value")
        expires_at = body.get("expires_at") or (body.get("client_secret") or {}).get("expires_at")
    except (ValueError, AttributeError) as exc:
        raise CallUnavailable("OpenAI sent an answer Orbit couldn't read.") from exc
    if not isinstance(value, str) or not value:
        raise CallUnavailable("OpenAI sent an answer Orbit couldn't read.")
    return {"value": value, "expires_at": int(expires_at) if isinstance(expires_at, int | float) else None}


# Refs: the call lasts many tool calls, so the phone keeps the refs map ({"task-3": {kind, id, label}}) and sends it back
# with each one. Every id in it is checked against this user's own rows before it is used.


def refs_of(run: assistant_actions.Run) -> dict[str, dict[str, Any]]:
    return {name: {"kind": item.kind, "id": str(item.id), "label": item.label} for name, item in run.items.items()}


def load_refs(run: assistant_actions.Run, refs: dict[str, Any]) -> None:
    """Puts the phone's refs back into the run: only well-formed ones, for kinds the user can see, whose rows they own."""
    wanted: dict[str, dict[uuid.UUID, tuple[str, str]]] = {}
    for name, value in list(refs.items())[:MAX_REFS]:
        if not isinstance(value, dict):
            continue
        kind = value.get("kind")
        if kind not in assistant_actions.KINDS or not isinstance(name, str) or not name.startswith(f"{kind}-"):
            continue
        try:
            item_id = uuid.UUID(str(value.get("id")))
        except ValueError:
            continue
        label = str(value.get("label") or kind)[: assistant_actions.TEXT_MAX]
        wanted.setdefault(kind, {})[item_id] = (name, label)
    for kind, items in wanted.items():
        model = assistant_actions.KINDS[kind].model
        owned = set(run.db.scalars(select(model.id).where(model.user_id == run.user_id, model.id.in_(items))).all())
        for item_id, (name, label) in items.items():
            if item_id in owned and name not in run.items and item_id not in run.by_id:
                run.items[name] = assistant_actions.Item(kind, item_id, label)
                run.by_id[item_id] = name


def tool_output(text: str) -> str:
    """A tool's answer, cut to a size the model reads quickly."""
    return text if len(text) <= 6000 else json.dumps({"error": "Too many results. Search with more words."})
