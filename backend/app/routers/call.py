"""The voice call with the assistant: the user talks, the assistant answers out loud, in real time.

Two ways, picked in Integrations > "What each feature uses": OpenAI Realtime with the user's OpenAI key
(app.services.voice_call), or ElevenLabs Agents with the ElevenLabs key saved as their voice model
(app.services.elevenlabs_call). GET /assistant/call says whether a call can start, which way, and with which voices.
POST /assistant/call/session makes what one call needs (a short-lived secret or token); the phone then talks to OpenAI
or ElevenLabs directly. POST /assistant/call/tool answers each tool call the model makes during the call, with the text
assistant's own tools: nothing is saved here, and the proposed changes go back to the phone for the user to confirm.
"""

import json
import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import Field

from app.deps import Db, UserId
from app.routers.assistant import ACT_SYSTEM, ProposedAction, _zone, ask_context, local_today
from app.schemas.tasks import Input
from app.services import assistant_actions, elevenlabs_call, feature_models, sections, voice_call
from app.services.agent import Call

router = APIRouter(prefix="/assistant/call", tags=["assistant"])

SPEECH = {
    "ar": "Speak Arabic the way people in Saudi Arabia talk every day (a light Najdi/Hijazi everyday dialect), unless the "
    "user switches to English. Say numbers, times and amounts the way a Saudi would say them out loud.",
    "en": "Speak English, unless the user switches to Arabic; then answer in everyday Saudi Arabic.",
}

CALL_SYSTEM = f"""This is a live voice call. You are the assistant inside Orbit, the user's personal life dashboard, \
talking with them out loud. Keep every answer short and natural for speech: one or two sentences, no lists, no markdown, \
no reading out refs, ids or long numbers. Be warm and quick. If they talk over you, stop and listen.

You can answer questions about their day from "My data" below, and you can add, change or delete things for them with \
your tools. The rules for changes are the same as in the app's text assistant:

{ACT_SYSTEM}

On this call, the changes you propose appear on the user's screen as cards, and they tap to save them. So after \
proposing, say in a few words what you prepared and that it is on the screen to confirm. Never say it is saved. If they \
say they saved it, you will also get a short note. If they ask you to save or confirm it yourself, tell them to tap Save \
on the screen."""

# The prompt kept on the ElevenLabs agent itself, with no personal data: every call replaces it with the full one.
AGENT_PROMPT = "You are the assistant inside Orbit, a personal life dashboard. Each call sends your full instructions."

Provider = Literal["openai", "elevenlabs"]


class VoiceOption(Input):
    id: str
    name: str
    arabic: bool


class CallStatus(Input):
    available: bool
    # Where the key comes from: "voice" (Integrations > Voice) or "ai" (Integrations > AI).
    source: Literal["voice", "ai"] | None = None
    # Which way the call goes (the user's pick, else the default). Older apps read only the fields above.
    provider: Provider | None = None
    # OpenAI's voice names; for ElevenLabs, the ids of voice_options.
    voices: list[str] = list(voice_call.VOICES)
    voice_options: list[VoiceOption] = Field(default_factory=list)


class SessionRequest(Input):
    locale: Literal["en", "ar"]
    # An OpenAI voice name, or an ElevenLabs voice id. Empty: the default voice.
    voice: str | None = Field(default=None, max_length=64)
    # The ways this app can call. Apps from before ElevenLabs send nothing, so they only get OpenAI.
    providers: list[Provider] = Field(default_factory=lambda: ["openai"], max_length=4)


class Ref(Input):
    kind: str
    id: uuid.UUID
    label: str


class SessionReply(Input):
    provider: Provider = "openai"
    # OpenAI: starts one call, within two minutes. The phone sends it to OpenAI once and forgets it.
    client_secret: str = ""
    expires_at: int | None = None
    model: str
    refs: dict[str, Ref]
    # ElevenLabs: the token that starts one call, and the call's instructions, greeting, language and voice.
    conversation_token: str | None = None
    overrides: dict[str, Any] | None = None
    # The tools the phone answers (ElevenLabs asks the phone for each by name).
    tools: list[str] = Field(default_factory=list)


class ToolRequest(Input):
    name: str = Field(min_length=1, max_length=60)
    # The model's arguments, as the JSON text it sent.
    arguments: str = Field(max_length=8000)
    refs: dict[str, dict[str, Any]] = Field(default_factory=dict, max_length=voice_call.MAX_REFS)


class ToolReply(Input):
    # Sent back to the model as the tool's result.
    output: str
    actions: list[ProposedAction]
    # The refs the call knows now (the ones sent, plus any find_items added).
    refs: dict[str, Ref]


NO_KEY = "Add an OpenAI key (AI or Voice) or an ElevenLabs voice model in Integrations to call the assistant."


def _provider(db: Db, user_id: uuid.UUID) -> Provider | None:
    """The way the call goes now: the user's pick if it is still connected, else OpenAI, else ElevenLabs."""
    effective = feature_models.state(db, user_id, "call").effective
    if effective is None:
        return None
    return "elevenlabs" if effective == feature_models.ELEVENLABS else "openai"


def _key(db: Db, user_id: uuid.UUID) -> voice_call.CallKey:
    key = voice_call.call_key(db, user_id)
    if key is None:
        # 409 like the other assistant routes: the app offers Integrations instead of "try again".
        raise HTTPException(status.HTTP_409_CONFLICT, NO_KEY)
    return key


def _instructions(db: Db, user_id: uuid.UUID, run: assistant_actions.Run, locale: str) -> str:
    items = assistant_actions.context(run)
    data = sections.drop_hidden(ask_context(db, user_id, local_today(run.zone)), run.hidden)
    # The data goes in as JSON, so nothing in it can pose as an instruction.
    return f"{CALL_SYSTEM}\n\n{SPEECH[locale]}\n\nMy data:\n{_json(data)}\n\nNow and my items (with refs for your tools):\n{_json(items)}"


def _run(db: Db, user_id: uuid.UUID) -> assistant_actions.Run:
    return assistant_actions.Run(
        db, user_id, _zone(db, user_id), assistant_actions.default_currency(db, user_id), hidden=sections.hidden_for(db, user_id)
    )


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str, separators=(",", ":"))


@router.get("", response_model=CallStatus)
def call_status(user_id: UserId, db: Db):
    provider = _provider(db, user_id)
    if provider == "elevenlabs":
        api_key = voice_call.elevenlabs_key(db, user_id) or ""
        db.rollback()
        try:
            found = elevenlabs_call.voices(api_key)
        except elevenlabs_call.CallUnavailable:
            # The call can still start with the agent's default voice.
            found = []
        options = [VoiceOption(id=v.id, name=v.name, arabic=v.arabic) for v in found]
        return CallStatus(available=True, source="voice", provider="elevenlabs", voices=[v.id for v in options], voice_options=options)
    key = voice_call.call_key(db, user_id)
    options = [VoiceOption(id=name, name=name.capitalize(), arabic=False) for name in voice_call.VOICES]
    return CallStatus(available=key is not None, source=key.source if key else None, provider=provider, voice_options=options)


@router.post("/session", response_model=SessionReply)
def start_session(body: SessionRequest, user_id: UserId, db: Db):
    provider = _provider(db, user_id)
    # An app from before ElevenLabs calls with OpenAI when it can.
    if provider == "elevenlabs" and "elevenlabs" not in body.providers:
        if voice_call.call_key(db, user_id) is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Update the app to call with ElevenLabs.")
        provider = "openai"
    if provider == "elevenlabs":
        return _elevenlabs_session(body, user_id, db)
    voice = body.voice or voice_call.VOICES[0]
    if voice not in voice_call.VOICES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Not one of the call's voices.")
    key = _key(db, user_id)
    run = _run(db, user_id)
    instructions = _instructions(db, user_id, run, body.locale)
    model = feature_models.realtime_model(db, user_id, "call")
    config = voice_call.session_config(instructions, voice, body.locale, assistant_actions.tools(run.hidden), model)
    db.rollback()
    try:
        secret = voice_call.client_secret(key.api_key, config)
    except voice_call.CallKeyRejected as exc:
        # Never 401: the app would take that as "your Orbit session ended".
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except voice_call.CallUnavailable as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    refs = voice_call.refs_of(run)
    return {"client_secret": secret["value"], "expires_at": secret["expires_at"], "model": model, "refs": refs}


def _elevenlabs_session(body: SessionRequest, user_id: uuid.UUID, db: Db) -> dict[str, Any]:
    if body.voice and not elevenlabs_call.VOICE_ID.match(body.voice):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Not an ElevenLabs voice.")
    api_key = voice_call.elevenlabs_key(db, user_id)
    if api_key is None:
        raise HTTPException(status.HTTP_409_CONFLICT, NO_KEY)
    run = _run(db, user_id)
    instructions = _instructions(db, user_id, run, body.locale)
    tools = assistant_actions.tools(run.hidden)
    refs = voice_call.refs_of(run)
    db.rollback()
    try:
        _, token = elevenlabs_call.start(user_id, api_key, tools, AGENT_PROMPT)
    except elevenlabs_call.CallKeyRejected as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except elevenlabs_call.CallUnavailable as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return {
        "provider": "elevenlabs",
        "model": elevenlabs_call.TTS_MODEL,
        "refs": refs,
        "conversation_token": token,
        "overrides": elevenlabs_call.overrides(instructions, body.locale, body.voice),
        "tools": [tool.name for tool in tools],
    }


@router.post("/tool", response_model=ToolReply)
def run_tool(body: ToolRequest, user_id: UserId, db: Db):
    """One tool call from the model during a call. Reads only; the proposed changes go back to the phone."""
    if _provider(db, user_id) is None:
        raise HTTPException(status.HTTP_409_CONFLICT, NO_KEY)
    run = _run(db, user_id)
    voice_call.load_refs(run, body.refs)
    try:
        arguments = json.loads(body.arguments) if body.arguments.strip() else {}
    except ValueError:
        arguments = None
    if isinstance(arguments, dict):
        arguments = voice_call.decode_arguments(assistant_actions.tools(run.hidden), body.name, arguments)
    output = assistant_actions.handle(run, Call(body.name, arguments if isinstance(arguments, dict) else None))
    db.rollback()
    return {"output": voice_call.tool_output(output), "actions": run.actions, "refs": voice_call.refs_of(run)}
