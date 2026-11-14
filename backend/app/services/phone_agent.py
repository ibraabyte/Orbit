"""The phone agent: it plans a call from what the user asked for, then talks on the phone for them.

Planning: the user's own AI turns "book me a barber tomorrow afternoon" into a plan (the goal, the opening line, what
the agent may agree to, the task title). Without an AI, the request itself becomes the plan. The user reads the plan,
can change it, and only their approval starts the call.

Talking: Twilio streams the call's audio (8 kHz mu-law) to Orbit's /calls/stream websocket, and this module passes it
to OpenAI Realtime with the user's own OpenAI key, and the AI's voice back to Twilio. The rules the agent keeps are in
the instructions below: it says first that it is an automated assistant calling for the user, it never pays or agrees
to pay, and never gives out anything about the user except their name. When it is done it calls finish_call with the
outcome, then says goodbye and Orbit hangs up. The words both sides said are kept with the call; the audio is not.
"""

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session
from starlette.websockets import WebSocketDisconnect

from app import models as m
from app.services import assistant, voice_call, whoop_ai

log = logging.getLogger(__name__)

MODEL = "gpt-realtime"
REALTIME_URL = "wss://api.openai.com/v1/realtime?model=" + MODEL
# OpenAI's realtime voices; marin and cedar sound the most natural.
VOICES = ("marin", "cedar", "ash", "coral", "sage", "verse")
# Hard limits that keep a call (and its bill) small.
TIME_LIMIT_SECONDS = 300
RING_SECONDS = 30
CALLS_PER_DAY = 10
# After finish_call: how long the goodbye may take before Orbit hangs up anyway.
GOODBYE_SECONDS = 8.0
TRANSCRIPT_MAX = 200

FINISH_TOOL = {
    "type": "function",
    "name": "finish_call",
    "description": "Call this once the call has reached its end: booked, refused, needs the user, or nobody to talk to.",
    "parameters": {
        "type": "object",
        "properties": {
            "outcome": {
                "type": "string",
                "enum": list(m.calls.OUTCOMES),
                "description": "booked: a time was agreed. not_booked: they can't or won't. needs_you: they offered something "
                "outside what you may accept, or asked something only the user can answer. no_answer: voicemail, a menu "
                "you couldn't get through, or nobody spoke.",
            },
            "appointment_at": {
                "type": ["string", "null"],
                "description": "Only when booked: the agreed local date and time as YYYY-MM-DDTHH:MM.",
            },
            "summary": {
                "type": "string",
                "description": "Two or three short sentences for the user, in the language of their request: what was "
                "agreed, any price or condition they mentioned, other times they offered.",
            },
        },
        "required": ["outcome", "summary"],
    },
}


def openai_key(db: Session, user_id: uuid.UUID) -> str | None:
    """The user's own OpenAI key (the same one the in-app voice call uses). None when they saved none."""
    key = voice_call.call_key(db, user_id)
    return key.api_key if key else None


def disclosure(caller_name: str | None, arabic: bool) -> str:
    """The agent's first words, always: who is calling and for whom. The user can't change this part."""
    if arabic:
        return (
            f"السلام عليكم، معك مساعد آلي أتصل نيابة عن {caller_name}."
            if caller_name
            else "السلام عليكم، معك مساعد آلي أتصل نيابة عن أحد العملاء."
        )
    return (
        f"Hello, this is an automated assistant calling on behalf of {caller_name}."
        if caller_name
        else "Hello, this is an automated assistant calling on behalf of a customer."
    )


def is_arabic(value: str) -> bool:
    return any("؀" <= ch <= "ۿ" for ch in value)


@dataclass(frozen=True)
class Plan:
    business_name: str
    goal: str
    opening: str
    allowed: str | None
    task_title: str | None


PLAN_SYSTEM = """You prepare a short phone call that an automated assistant will make for the user, usually to book an \
appointment at a business (barber, clinic, car service, restaurant). The user wrote what they want. Answer with one JSON \
object only, no other text:
{"business_name": "...", "goal": "...", "opening": "...", "allowed": "...", "task_title": "..."}
- business_name: the kind of place or its name, short (e.g. "الحلاق").
- goal: one sentence, what the call must achieve, with the concrete date (turn "tomorrow" into the real date from the \
current time given).
- opening: what the assistant says right after it introduces itself, one or two short sentences in friendly Saudi \
Arabic (or English if the user wrote English). Don't introduce yourself here; that part is fixed.
- allowed: what the assistant may agree to without asking the user: the acceptable days and time window, e.g. \
"بكرا الأحد ١٥ نوفمبر بين ٣ العصر و٦ المغرب". Empty string if the user gave no limits.
- task_title: a short task title for a booked appointment, e.g. "موعد الحلاق".
Never add payments, deposits, personal details or anything the user didn't ask for."""


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    value = " ".join(value.split())
    return value[:limit] or None


def fallback_plan(request: str, business_name: str | None) -> Plan:
    arabic = is_arabic(request)
    name = business_name or ("المحل" if arabic else "the business")
    return Plan(name[:120], request[:500], request[:300], None, None)


def make_plan(db: Session, user_id: uuid.UUID, request: str, business_name: str | None, zone: ZoneInfo) -> Plan:
    """The user's own AI writes the plan; without one (or if it fails) the request is the plan."""
    access = whoop_ai.access_for(db, user_id)
    if access is None:
        return fallback_plan(request, business_name)
    now = datetime.now(zone)
    prompt = (
        f"Current local time: {now:%A %Y-%m-%d %H:%M} ({zone.key}).\nBusiness: {business_name or 'not given'}\nThe user wrote: {request}"
    )
    try:
        raw = assistant.complete(access, PLAN_SYSTEM, prompt, max_tokens=600)
        start, end = raw.find("{"), raw.rfind("}")
        data = json.loads(raw[start : end + 1]) if 0 <= start < end else {}
    except (whoop_ai.InsightUnavailable, ValueError):
        return fallback_plan(request, business_name)
    if not isinstance(data, dict):
        return fallback_plan(request, business_name)
    base = fallback_plan(request, business_name)
    return Plan(
        business_name=business_name or _text(data.get("business_name"), 120) or base.business_name,
        goal=_text(data.get("goal"), 500) or base.goal,
        opening=_text(data.get("opening"), 300) or base.opening,
        allowed=_text(data.get("allowed"), 300),
        task_title=_text(data.get("task_title"), 120),
    )


def instructions(call: m.PhoneCall, zone: ZoneInfo) -> str:
    arabic = is_arabic(call.request)
    first = f"{disclosure(call.caller_name, arabic)} {call.opening}"
    now = datetime.now(zone)
    who = call.caller_name or "the customer"
    language = (
        "Speak natural everyday Saudi Arabic, short and polite sentences, the way people talk to a shop on the phone."
        if arabic
        else "Speak clear, polite English. If they answer in Arabic, switch to Saudi Arabic."
    )
    allowed = call.allowed or "Nothing beyond the goal itself; if they offer anything specific, check it fits the goal."
    return f"""You are an automated phone assistant. You are on a live phone call with {call.business_name}, calling on \
behalf of {who}. {language}

Your very first words, before anything else, must be: "{first}"

Goal of the call: {call.goal}
You may agree to, without asking {who}: {allowed}
Current local time: {now:%A %Y-%m-%d %H:%M} ({zone.key}).

Rules you always keep:
- If anyone asks whether you are a person or a machine, say honestly that you are an automated assistant.
- Never pay, never agree to pay or to a deposit, never give card numbers, ID or iqama numbers, addresses, codes, \
passwords or any personal detail. The only thing you may give is the name {who}. If they need anything else, say \
{who} will get back to them.
- If they offer something outside what you may agree to, don't accept it: ask what other times they have, remember \
them, and finish with outcome needs_you.
- Stay on the goal. Don't make other plans or promises.
- Before you finish, repeat the agreed day and time back once to confirm.
- If it is voicemail, a recorded menu you can't get through, or nobody speaks, finish with outcome no_answer without \
leaving a message.
- When the call has reached its end, call finish_call, then say a short goodbye. Keep the whole call under four minutes."""


def session_update(call: m.PhoneCall, voice: str, zone: ZoneInfo) -> dict[str, Any]:
    return {
        "type": "session.update",
        "session": {
            "type": "realtime",
            "model": MODEL,
            "instructions": instructions(call, zone),
            "output_modalities": ["audio"],
            "audio": {
                "input": {
                    # Twilio's phone audio, as is: 8 kHz mu-law.
                    "format": {"type": "audio/pcmu"},
                    "transcription": {"model": "gpt-4o-mini-transcribe", "language": "ar" if is_arabic(call.request) else "en"},
                    "turn_detection": {"type": "server_vad", "create_response": True, "interrupt_response": True},
                },
                "output": {"format": {"type": "audio/pcmu"}, "voice": voice},
            },
            "tools": [FINISH_TOOL],
            "tool_choice": "auto",
        },
    }


def appointment_time(value: Any, zone: ZoneInfo) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        moment = datetime.fromisoformat(value.strip())
    except ValueError:
        return None
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=zone)
    return moment.astimezone(UTC)


# --- The live call -------------------------------------------------------------------------------------------------


class Realtime(Protocol):
    async def send(self, message: str) -> None: ...

    def __aiter__(self) -> AsyncIterator[str]: ...


@asynccontextmanager
async def _openai(api_key: str) -> AsyncIterator[Realtime]:
    from websockets.asyncio.client import connect

    async with connect(REALTIME_URL, additional_headers={"Authorization": f"Bearer {api_key}"}, max_size=None) as socket:
        yield socket


# Replaced in tests with a fake OpenAI.
open_realtime: Callable[[str], Any] = _openai


@dataclass
class Result:
    outcome: str | None = None
    appointment_at: datetime | None = None
    summary: str | None = None
    transcript: list[dict[str, str]] = field(default_factory=list)
    error: str | None = None

    def said(self, who: str, words: Any) -> None:
        if isinstance(words, str) and words.strip() and len(self.transcript) < TRANSCRIPT_MAX:
            self.transcript.append({"who": who, "text": words.strip()[:1000]})


class Twilio(Protocol):
    async def receive_text(self) -> str: ...

    async def send_text(self, data: str) -> None: ...


async def talk(twilio: Twilio, stream_sid: str, ai: Realtime, setup: dict[str, Any], zone: ZoneInfo, hang_up) -> Result:
    """Passes audio both ways until the call ends. hang_up() is awaited once the agent has said goodbye."""
    result = Result()
    state = {"latest_ms": 0, "item": None, "item_start_ms": None, "ending": False, "hung_up": False}

    async def send_twilio(event: dict[str, Any]) -> None:
        await twilio.send_text(json.dumps({**event, "streamSid": stream_sid}))

    async def end() -> None:
        if not state["hung_up"]:
            state["hung_up"] = True
            await hang_up()

    async def end_later() -> None:
        await asyncio.sleep(GOODBYE_SECONDS)
        await end()

    timers: list[asyncio.Task] = []
    await ai.send(json.dumps(setup))
    # The agent speaks first: it introduces itself as soon as someone answers.
    await ai.send(json.dumps({"type": "response.create"}))

    async def from_twilio() -> None:
        while True:
            try:
                message = json.loads(await twilio.receive_text())
            except WebSocketDisconnect:
                return
            event = message.get("event")
            if event == "media":
                media = message.get("media") or {}
                state["latest_ms"] = int(media.get("timestamp") or state["latest_ms"])
                await ai.send(json.dumps({"type": "input_audio_buffer.append", "audio": media.get("payload", "")}))
            elif event == "mark" and (message.get("mark") or {}).get("name") == "goodbye":
                await end()
            elif event == "stop":
                return

    async def from_ai() -> None:
        async for raw in ai:
            event = json.loads(raw)
            kind = event.get("type")
            if kind in ("response.output_audio.delta", "response.audio.delta"):
                if state["item"] != event.get("item_id"):
                    state["item"], state["item_start_ms"] = event.get("item_id"), state["latest_ms"]
                await send_twilio({"event": "media", "media": {"payload": event.get("delta", "")}})
            elif kind == "input_audio_buffer.speech_started":
                # They started talking: stop the agent's audio at once, and tell the AI how much of it was heard.
                await send_twilio({"event": "clear"})
                if state["item"] and state["item_start_ms"] is not None:
                    heard = max(0, state["latest_ms"] - state["item_start_ms"])
                    await ai.send(
                        json.dumps(
                            {"type": "conversation.item.truncate", "item_id": state["item"], "content_index": 0, "audio_end_ms": heard}
                        )
                    )
                state["item"] = state["item_start_ms"] = None
            elif kind in ("response.output_audio_transcript.done", "response.audio_transcript.done"):
                result.said("agent", event.get("transcript"))
            elif kind == "conversation.item.input_audio_transcription.completed":
                result.said("them", event.get("transcript"))
            elif kind == "response.function_call_arguments.done" and event.get("name") == "finish_call":
                try:
                    args = json.loads(event.get("arguments") or "{}")
                except ValueError:
                    args = {}
                outcome = args.get("outcome") if args.get("outcome") in m.calls.OUTCOMES else "needs_you"
                moment = appointment_time(args.get("appointment_at"), zone)
                if outcome == "booked" and moment is None:
                    outcome = "needs_you"
                result.outcome, result.appointment_at = outcome, moment if outcome == "booked" else None
                result.summary = _text(args.get("summary"), 1000)
                state["ending"] = True
                await ai.send(
                    json.dumps(
                        {
                            "type": "conversation.item.create",
                            "item": {
                                "type": "function_call_output",
                                "call_id": event.get("call_id"),
                                "output": json.dumps({"ok": True, "next": "Say a short goodbye now."}),
                            },
                        }
                    )
                )
                await ai.send(json.dumps({"type": "response.create"}))
                timers.append(asyncio.create_task(end_later()))
            elif kind == "response.done" and state["ending"]:
                # The goodbye is the first response after finish_call that isn't the function call itself. Twilio
                # sends this mark back once the audio before it has played; then Orbit hangs up.
                output = (event.get("response") or {}).get("output") or []
                if not any(isinstance(item, dict) and item.get("type") == "function_call" for item in output):
                    await send_twilio({"event": "mark", "mark": {"name": "goodbye"}})
            elif kind == "error":
                error = event.get("error") or {}
                log.warning("realtime error: %s", error.get("code") or error.get("type"))
                if error.get("type") in ("invalid_request_error", "authentication_error") and not result.transcript:
                    result.error = "OpenAI refused the call's settings or the key. Check your OpenAI key in Integrations."
                    await end()
                    return

    listening = asyncio.create_task(from_twilio())
    tasks = [listening, asyncio.create_task(from_ai())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        # OpenAI went away while the call is still on: don't leave them listening to silence.
        if not listening.done():
            await end()
    finally:
        for task in tasks + timers:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    return result


def reminder_for(moment: datetime) -> datetime | None:
    """An hour before the appointment, if that is still ahead."""
    reminder = moment - timedelta(hours=1)
    return reminder if reminder > datetime.now(UTC) else None


def booked_task(call: m.PhoneCall) -> m.Task:
    arabic = is_arabic(call.request)
    title = call.task_title or (f"موعد: {call.business_name}" if arabic else f"Appointment: {call.business_name}")
    return m.Task(
        user_id=call.user_id,
        title=title[:220],
        notes=call.summary,
        due_at=call.appointment_at,
        reminder_at=reminder_for(call.appointment_at) if call.appointment_at else None,
        priority="normal",
    )
