"""The voice call with the assistant: the user talks, the assistant answers out loud, in real time.

GET /assistant/call says whether a call can start (the user saved an OpenAI key). POST /assistant/call/session makes a
short-lived secret for one call (app.services.voice_call); the phone then talks to OpenAI directly. POST
/assistant/call/tool answers each tool call the model makes during the call, with the text assistant's own tools:
nothing is saved here, and the proposed changes go back to the phone for the user to confirm.
"""

import json
import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import Field

from app.deps import Db, UserId
from app.routers.assistant import ACT_SYSTEM, ProposedAction, _zone, ask_context, local_today
from app.schemas.tasks import Input
from app.services import assistant_actions, feature_models, sections, voice_call
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


class CallStatus(Input):
    available: bool
    # Where the OpenAI key comes from: "voice" (Integrations > Voice) or "ai" (Integrations > AI).
    source: Literal["voice", "ai"] | None = None
    voices: list[str] = list(voice_call.VOICES)


class SessionRequest(Input):
    locale: Literal["en", "ar"]
    voice: Literal[voice_call.VOICES] = voice_call.VOICES[0]  # type: ignore[valid-type]


class Ref(Input):
    kind: str
    id: uuid.UUID
    label: str


class SessionReply(Input):
    # Starts one call, within two minutes. The phone sends it to OpenAI once and forgets it.
    client_secret: str
    expires_at: int | None
    model: str
    refs: dict[str, Ref]


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


def _key(db: Db, user_id: uuid.UUID) -> voice_call.CallKey:
    key = voice_call.call_key(db, user_id)
    if key is None:
        # 409 like the other assistant routes: the app offers Integrations instead of "try again".
        raise HTTPException(status.HTTP_409_CONFLICT, "Add an OpenAI key in Integrations (AI or Voice) to call the assistant.")
    return key


def _run(db: Db, user_id: uuid.UUID) -> assistant_actions.Run:
    return assistant_actions.Run(
        db, user_id, _zone(db, user_id), assistant_actions.default_currency(db, user_id), hidden=sections.hidden_for(db, user_id)
    )


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str, separators=(",", ":"))


@router.get("", response_model=CallStatus)
def call_status(user_id: UserId, db: Db):
    key = voice_call.call_key(db, user_id)
    return CallStatus(available=key is not None, source=key.source if key else None)


@router.post("/session", response_model=SessionReply)
def start_session(body: SessionRequest, user_id: UserId, db: Db):
    key = _key(db, user_id)
    run = _run(db, user_id)
    items = assistant_actions.context(run)
    data = sections.drop_hidden(ask_context(db, user_id, local_today(run.zone)), run.hidden)
    # The data goes in as JSON, so nothing in it can pose as an instruction.
    instructions = (
        f"{CALL_SYSTEM}\n\n{SPEECH[body.locale]}\n\nMy data:\n{_json(data)}\n\nNow and my items (with refs for your tools):\n{_json(items)}"
    )
    model = feature_models.realtime_model(db, user_id, "call")
    config = voice_call.session_config(instructions, body.voice, body.locale, assistant_actions.tools(run.hidden), model)
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


@router.post("/tool", response_model=ToolReply)
def run_tool(body: ToolRequest, user_id: UserId, db: Db):
    """One tool call from the model during a call. Reads only; the proposed changes go back to the phone."""
    _key(db, user_id)
    run = _run(db, user_id)
    voice_call.load_refs(run, body.refs)
    try:
        arguments = json.loads(body.arguments) if body.arguments.strip() else {}
    except ValueError:
        arguments = None
    output = assistant_actions.handle(run, Call(body.name, arguments if isinstance(arguments, dict) else None))
    db.rollback()
    return {"output": voice_call.tool_output(output), "actions": run.actions, "refs": voice_call.refs_of(run)}
