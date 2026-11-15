"""The live voice call through ElevenLabs Agents, with the user's own ElevenLabs key (Integrations > Voice).

The key never leaves the server. ElevenLabs runs a call through an "agent" kept in the user's own ElevenLabs account,
so the first call makes one there, named "Orbit assistant", with the assistant's tools as client tools (the phone runs
them, through POST /assistant/call/tool, exactly as in the OpenAI call). Later calls reuse it, and change it only when
the tools changed (a section was hidden, say). The agent holds no personal data: the instructions with the user's day
go in each call's overrides, which the phone sends when the call starts, and the agent keeps no recording of the voice.

For each call the server asks ElevenLabs for a conversation token (it starts one call, within minutes) and hands it to
the phone with the call's overrides. The audio then goes between the phone and ElevenLabs over WebRTC, never through
Orbit, and nothing of it is kept here.

Phone calls (app.services.phone_agent) use a second agent, "Orbit phone agent", that hears and speaks phone audio
(8 kHz mu-law) and has one tool, finish_call. There Twilio's audio goes through Orbit's server to ElevenLabs over a
websocket opened with a signed URL; each call sends its own plan as overrides.
"""

import hashlib
import json
import re
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import httpx2 as httpx

from app.services.agent import Tool

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None

API = "https://api.elevenlabs.io"
AGENT_NAME = "Orbit assistant"
PHONE_AGENT_NAME = "Orbit phone agent"
# Twilio's phone audio, as is: ElevenLabs hears and speaks it without converting.
PHONE_AUDIO = "ulaw_8000"
AGENT_TAG = "orbit"
# Ends the description of every tool Orbit makes, so they are told apart from the user's own tools of the same name.
TOOL_MARK = " (Orbit)"
# Speaks Arabic and English, with low delay: the model ElevenLabs asks for when an agent isn't English-only.
TTS_MODEL = "eleven_flash_v2_5"
# The same limit as the OpenAI call, so a forgotten call doesn't keep spending the user's credit.
MAX_SECONDS = 15 * 60
FIRST_MESSAGE = {"ar": "هلا! وش أقدر أسوي لك؟", "en": "Hi! What can I do for you?"}
MAX_VOICES = 40
VOICE_ID = re.compile(r"^[A-Za-z0-9]{8,40}$")
_ARABIC_ACCENT = re.compile(r"arab|saudi|gulf|khaleeji|najdi|hijazi|emirati|kuwaiti|egypt|levant|عرب|سعود|خليج", re.I)


class CallUnavailable(Exception):
    """ElevenLabs couldn't be reached or answered with an error. The message is safe to show."""


class CallKeyRejected(CallUnavailable):
    """ElevenLabs refused the key (or the key can't use Agents)."""


class _NotFound(CallUnavailable):
    pass


@dataclass(frozen=True)
class Voice:
    id: str
    name: str
    # Speaks Arabic well: an Arabic voice, or one ElevenLabs checked in Arabic.
    arabic: bool


@dataclass
class _Setup:
    agent_id: str | None = None
    agent_hash: str | None = None
    # name -> (tool id, hash of what was last sent)
    tools: dict[str, tuple[str, str | None]] = field(default_factory=dict)


# What this server last set up in each account, so a call doesn't list and update everything each time. It is only a
# shortcut: after a restart (or if something was removed in ElevenLabs) it is found again.
_setups: dict[str, _Setup] = {}
_lock = threading.Lock()


def _account(user_id: uuid.UUID, api_key: str) -> str:
    return f"{user_id}:{hashlib.sha256(api_key.encode()).hexdigest()[:16]}"


def _hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def _request(api_key: str, method: str, path: str, **kwargs: Any) -> Any:
    try:
        with httpx.Client(transport=transport, timeout=30.0, base_url=API) as client:
            response = client.request(method, path, headers={"xi-api-key": api_key}, **kwargs)
    except httpx.HTTPError as exc:
        raise CallUnavailable("Can't reach ElevenLabs from the server. Try again later.") from exc
    if response.status_code in (401, 403):
        raise CallKeyRejected("ElevenLabs refused this API key, or the key can't use Agents. Give the key Agents access in ElevenLabs.")
    if response.status_code == 404:
        raise _NotFound("ElevenLabs couldn't find the Orbit assistant.")
    if response.status_code in (402, 429):
        raise CallUnavailable("ElevenLabs is busy or the account is out of credit. Try again later.")
    if response.status_code >= 300:
        raise CallUnavailable(f"ElevenLabs answered with an error ({response.status_code}). Try again later.")
    try:
        return response.json()
    except ValueError as exc:
        raise CallUnavailable("ElevenLabs sent an answer Orbit couldn't read.") from exc


# Tools. ElevenLabs takes a narrower schema than OpenAI: every value needs a description, and an object needs its
# properties listed. An object with free fields (the item's fields) is sent as JSON text instead, and read back by
# app.services.voice_call.decode_arguments.


def _property(name: str, schema: dict[str, Any]) -> dict[str, Any]:
    description = str(schema.get("description") or name.replace("_", " "))
    kind = schema.get("type")
    if kind == "object":
        properties = schema.get("properties")
        if not properties:
            return {"type": "string", "description": f'{description} Send it as JSON text, like {{"title": "..."}}.'}
        return _object(properties, schema.get("required", []), description)
    if kind == "array":
        return {"type": "array", "description": description, "items": _property(name, schema.get("items") or {"type": "string"})}
    result: dict[str, Any] = {"type": kind if kind in ("boolean", "integer", "number") else "string", "description": description}
    if isinstance(schema.get("enum"), list):
        result["enum"] = [str(value) for value in schema["enum"]]
    return result


def _object(properties: dict[str, Any], required: list[str], description: str = "") -> dict[str, Any]:
    return {
        "type": "object",
        "description": description,
        "properties": {name: _property(name, value) for name, value in properties.items()},
        "required": [name for name in required if name in properties],
    }


def tool_config(tool: Tool) -> dict[str, Any]:
    return {
        "type": "client",
        "name": tool.name,
        "description": tool.description + TOOL_MARK,
        "parameters": _object(tool.parameters.get("properties", {}), tool.parameters.get("required", [])),
        "expects_response": True,
        "response_timeout_secs": 20,
    }


_PLATFORM = {
    # Only Orbit's server can start a call (with a token or a signed URL), and each call may set these four things.
    "auth": {"enable_auth": True},
    "overrides": {
        "conversation_config_override": {
            "agent": {"prompt": {"prompt": True}, "first_message": True, "language": True},
            "tts": {"voice_id": True},
        }
    },
    "privacy": {"record_voice": False},
}


def agent_config(tool_ids: list[str], base_prompt: str) -> dict[str, Any]:
    """The agent kept in the user's account. The prompt here is general: each call sends the real one as an override."""
    return {
        "name": AGENT_NAME,
        "tags": [AGENT_TAG],
        "conversation_config": {
            "agent": {"first_message": FIRST_MESSAGE["ar"], "language": "ar", "prompt": {"prompt": base_prompt, "tool_ids": tool_ids}},
            "tts": {"model_id": TTS_MODEL},
            "conversation": {"max_duration_seconds": MAX_SECONDS},
        },
        "platform_settings": _PLATFORM,
    }


def phone_agent_config(tool_ids: list[str], base_prompt: str, max_seconds: int) -> dict[str, Any]:
    """The phone agent: the same, but it hears and speaks phone audio. Each call's first words come as an override."""
    return {
        "name": PHONE_AGENT_NAME,
        "tags": [AGENT_TAG],
        "conversation_config": {
            "agent": {"language": "ar", "prompt": {"prompt": base_prompt, "tool_ids": tool_ids}},
            "asr": {"user_input_audio_format": PHONE_AUDIO},
            "tts": {"model_id": TTS_MODEL, "agent_output_audio_format": PHONE_AUDIO},
            "conversation": {"max_duration_seconds": max_seconds},
        },
        "platform_settings": _PLATFORM,
    }


def _pages(api_key: str, path: str, key: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    cursor = None
    for _ in range(5):
        body = _request(api_key, "GET", path, params={**params, "page_size": 100, **({"cursor": cursor} if cursor else {})})
        found += [item for item in body.get(key) or [] if isinstance(item, dict)]
        cursor = body.get("next_cursor")
        if not body.get("has_more") or not cursor:
            break
    return found


def _discover(api_key: str, names: set[str], agent_name: str) -> _Setup:
    setup = _Setup()
    for item in _pages(api_key, "/v1/convai/tools", "tools", {}):
        config = item.get("tool_config") or {}
        name = config.get("name")
        if name in names and str(config.get("description", "")).endswith(TOOL_MARK) and name not in setup.tools and item.get("id"):
            setup.tools[name] = (str(item["id"]), None)
    for agent in _pages(api_key, "/v1/convai/agents", "agents", {"search": agent_name}):
        if agent.get("name") == agent_name and AGENT_TAG in (agent.get("tags") or []) and agent.get("agent_id"):
            setup.agent_id = str(agent["agent_id"])
            break
    return setup


Config = Callable[[list[str]], dict[str, Any]]


def _ensure(api_key: str, account: str, tools: list[Tool], make_config: Config) -> str:
    """The agent's id, after making or updating it (and its tools) as needed."""
    setup = _setups.get(account) or _discover(api_key, {tool.name for tool in tools}, make_config([])["name"])
    for tool in tools:
        config = tool_config(tool)
        digest = _hash(config)
        known = setup.tools.get(tool.name)
        if known is None:
            made = _request(api_key, "POST", "/v1/convai/tools", json={"tool_config": config})
            if not made.get("id"):
                raise CallUnavailable("ElevenLabs sent an answer Orbit couldn't read.")
            setup.tools[tool.name] = (str(made["id"]), digest)
        elif known[1] != digest:
            _request(api_key, "PATCH", f"/v1/convai/tools/{known[0]}", json={"tool_config": config})
            setup.tools[tool.name] = (known[0], digest)
    config = make_config([setup.tools[tool.name][0] for tool in tools])
    digest = _hash(config)
    if setup.agent_id is None:
        made = _request(api_key, "POST", "/v1/convai/agents/create", json=config)
        if not made.get("agent_id"):
            raise CallUnavailable("ElevenLabs sent an answer Orbit couldn't read.")
        setup.agent_id, setup.agent_hash = str(made["agent_id"]), digest
    elif setup.agent_hash != digest:
        _request(api_key, "PATCH", f"/v1/convai/agents/{setup.agent_id}", json=config)
        setup.agent_hash = digest
    _setups[account] = setup
    return setup.agent_id


def _start(user_id: uuid.UUID, api_key: str, tools: list[Tool], make_config: Config, path: str, field_name: str) -> tuple[str, str]:
    """(agent id, the field from `path`) for one call. Something removed in ElevenLabs is made again, once."""
    account = f"{_account(user_id, api_key)}:{make_config([])['name']}"
    with _lock:
        for attempt in range(2):
            try:
                agent_id = _ensure(api_key, account, tools, make_config)
                body = _request(api_key, "GET", path, params={"agent_id": agent_id})
            except _NotFound:
                _setups.pop(account, None)
                if attempt:
                    raise
                continue
            value = body.get(field_name)
            if not isinstance(value, str) or not value:
                raise CallUnavailable("ElevenLabs sent an answer Orbit couldn't read.")
            return agent_id, value
    raise CallUnavailable("ElevenLabs couldn't start the call. Try again later.")  # pragma: no cover


def start(user_id: uuid.UUID, api_key: str, tools: list[Tool], base_prompt: str) -> tuple[str, str]:
    """(agent id, conversation token) for one call in the app."""
    return _start(user_id, api_key, tools, lambda ids: agent_config(ids, base_prompt), "/v1/convai/conversation/token", "token")


def phone_url(user_id: uuid.UUID, api_key: str, tools: list[Tool], base_prompt: str, max_seconds: int) -> str:
    """A signed websocket URL for one phone call (it works once, within minutes). The key stays on the server."""
    _, url = _start(
        user_id,
        api_key,
        tools,
        lambda ids: phone_agent_config(ids, base_prompt, max_seconds),
        "/v1/convai/conversation/get-signed-url",
        "signed_url",
    )
    if not url.startswith("wss://"):
        raise CallUnavailable("ElevenLabs sent an answer Orbit couldn't read.")
    return url


def overrides(prompt: str, locale: str, voice_id: str | None) -> dict[str, Any]:
    """What the phone sends as the call starts, in the shape of the ElevenLabs SDK's `overrides`."""
    result: dict[str, Any] = {"agent": {"prompt": {"prompt": prompt}, "firstMessage": FIRST_MESSAGE[locale], "language": locale}}
    if voice_id:
        result["tts"] = {"voiceId": voice_id}
    return result


def _is_arabic(voice: dict[str, Any]) -> bool:
    labels = voice.get("labels") or {}
    if str(labels.get("language", "")).lower().startswith("ar") or _ARABIC_ACCENT.search(str(labels.get("accent", ""))):
        return True
    return any(str((item or {}).get("language", "")).lower().startswith("ar") for item in voice.get("verified_languages") or [])


def voices(api_key: str) -> list[Voice]:
    """The voices in the user's ElevenLabs account (their own, saved and premade), Arabic ones first."""
    body = _request(api_key, "GET", "/v1/voices")
    found = []
    for item in body.get("voices") or []:
        if not isinstance(item, dict) or not VOICE_ID.match(str(item.get("voice_id", ""))):
            continue
        name = str(item.get("name") or item["voice_id"]).strip()[:60]
        found.append(Voice(str(item["voice_id"]), name, _is_arabic(item)))
    found.sort(key=lambda voice: (not voice.arabic, voice.name.lower()))
    return found[:MAX_VOICES]
