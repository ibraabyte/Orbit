"""The phone agent: it plans a call from what the user asked for, then talks on the phone for them.

Planning: the user's own AI turns "book me a barber tomorrow afternoon" into a plan (the goal, the opening line, what
the agent may agree to, the task title). Without an AI, the request itself becomes the plan. The user reads the plan,
can change it, and only their approval starts the call.

Talking: Twilio streams the call's audio (8 kHz mu-law) to Orbit's /calls/stream websocket, and this module passes it
to OpenAI Realtime with the user's own OpenAI key, and the AI's voice back to Twilio. The rules the agent keeps are in
the instructions below: it says first that it is an automated assistant calling for the user, it never pays or agrees
to pay, and never gives out anything about the user except their name. When it is done it calls finish_call with the
outcome, then says goodbye and Orbit hangs up. The words both sides said are kept with the call; the audio is not.

When the user picked ElevenLabs for the phone agent (Integrations), the audio goes to an ElevenLabs agent in their
account instead (app.services.elevenlabs_call), with the same instructions and tool. Orbit's server stays in the
middle, so it still keeps the words and the outcome.
"""

import asyncio
import base64
import binascii
import contextlib
import json
import logging
import threading
import time
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
from app.services import assistant, elevenlabs_call, voice_call, whoop_ai
from app.services.agent import Tool

log = logging.getLogger(__name__)

# The default; the user can pick gpt-realtime-mini for the phone agent in Integrations (app/services/feature_models.py).
MODEL = "gpt-realtime"
REALTIME_URL = "wss://api.openai.com/v1/realtime?model="
# OpenAI's realtime voices; marin and cedar sound the most natural.
VOICES = ("marin", "cedar", "ash", "coral", "sage", "verse")
# Hard limits that keep a call (and its bill) small.
TIME_LIMIT_SECONDS = 300
RING_SECONDS = 30
CALLS_PER_DAY = 10
# After finish_call: how long the goodbye may take before Orbit hangs up anyway.
GOODBYE_SECONDS = 15.0
# ElevenLabs sends the goodbye in pieces, with short gaps between them. Orbit hangs up only once everything sent has
# played and nothing more came for this long, so a gap between two sentences doesn't cut the goodbye off.
GOODBYE_QUIET_SECONDS = 2.5
# They spoke again after the goodbye: the call goes on. If the agent doesn't finish it again, Orbit hangs up once
# they have said nothing more for this long.
REOPEN_SECONDS = 20.0
# When the AI's side closes while the call is on: how long the audio already sent may keep playing before the hang-up.
CLOSE_SECONDS = 6.0
GOODBYE_NEXT = (
    "Now say a short, warm goodbye in the language of the call, and stop there. In Arabic end with «مع السلامة», "
    "for example «يعطيك العافية، مع السلامة». Don't hang up silently. If they say something more after your "
    "goodbye, answer them; when the call is done again, call finish_call again."
)
TRANSCRIPT_MAX = 200
# On a redial: how many lines of the dropped call the agent is given.
EARLIER_LINES = 40


def redial_opening(arabic: bool) -> str:
    """What the agent says after its fixed first words when it calls back after a dropped line."""
    return "معليش، انقطع الخط قبل شوي، نكمل من وين وقفنا." if arabic else "Sorry, the line dropped a moment ago; let's carry on."


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


FINISH = Tool(FINISH_TOOL["name"], FINISH_TOOL["description"], FINISH_TOOL["parameters"])
# The ElevenLabs agent's own prompt; every call replaces it with instructions() for that call.
ELEVEN_PROMPT = "You are an automated phone assistant. Each call gives you its goal and rules."


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
    # Whom the call is for, when the user said it is for someone else ("اتصل عن أمي"). None: the user themselves.
    on_behalf_of: str | None = None


PLAN_SYSTEM = """You prepare a short phone call that an automated assistant will make for the user, usually to book an \
appointment at a business (barber, clinic, car service, restaurant). The user wrote what they want. Answer with one JSON \
object only, no other text:
{"business_name": "...", "goal": "...", "opening": "...", "allowed": "...", "task_title": "...", "on_behalf_of": "..."}
- business_name: the kind of place or its name, short (e.g. "الحلاق").
- goal: one sentence, what the call must achieve, with the concrete date (turn "tomorrow" into the real date from the \
current time given).
- opening: what the assistant says right after it introduces itself, one or two short sentences in friendly Saudi \
Arabic (or English if the user wrote English). Don't introduce yourself here; that part is fixed.
- allowed: what the assistant may agree to without asking the user: the acceptable days and time window, e.g. \
"بكرا الأحد ١٥ نوفمبر بين ٣ العصر و٦ المغرب". Empty string if the user gave no limits.
- task_title: a short task title for a booked appointment, e.g. "موعد الحلاق".
- on_behalf_of: only when the user says the call is for someone else ("احجز لأمي", "اتصل نيابة عن خالد"), that \
person's name or how to call them (e.g. "خالد", "والدة إبراهيم"). Empty string when it is for the user.
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
        on_behalf_of=_text(data.get("on_behalf_of"), 60),
    )


def first_words(call: m.PhoneCall) -> str:
    return f"{disclosure(call.caller_name, is_arabic(call.request))} {call.opening}"


def instructions(call: m.PhoneCall, zone: ZoneInfo) -> str:
    arabic = is_arabic(call.request)
    first = first_words(call)
    now = datetime.now(zone)
    who = call.caller_name or "the customer"
    language = (
        "Speak natural everyday Saudi Arabic, short and polite sentences, the way people talk to a shop on the phone."
        if arabic
        else "Speak clear, polite English. If they answer in Arabic, switch to Saudi Arabic."
    )
    allowed = call.allowed or "Nothing beyond the goal itself; if they offer anything specific, check it fits the goal."
    scenario = (
        f"\nThe user's own script for this call. Follow it closely, within the rules below:\n{call.scenario}\n" if call.scenario else ""
    )
    earlier = ""
    if call.earlier_transcript:
        said = "\n".join(
            f"{'You' if line.get('who') == 'agent' else 'Them'}: {line.get('text', '')}"
            for line in call.earlier_transcript[-EARLIER_LINES:]
            if isinstance(line, dict)
        )
        earlier = (
            "\nThis is a second call: the line dropped during the first one. What was said before it dropped:\n"
            f"{said}\nCarry on from where it stopped; don't start over or ask again what they already answered.\n"
        )
    return f"""You are an automated phone assistant. You are on a live phone call with {call.business_name}, calling on \
behalf of {who}. {language}

Your very first words, before anything else, must be: "{first}"

Goal of the call: {call.goal}
You may agree to, without asking {who}: {allowed}
Current local time: {now:%A %Y-%m-%d %H:%M} ({zone.key}).
{scenario}{earlier}
Rules you always keep:
- If anyone asks whether you are a person or a machine, say honestly that you are an automated assistant.
- Never pay, never agree to pay or to a deposit, never give card numbers, ID or iqama numbers, addresses, codes, \
passwords or any personal detail. The only thing you may give is the name {who}. If they need anything else, say \
{who} will get back to them.
- If they offer something outside what you may agree to, don't accept it: ask what other times they have, remember \
them, and finish with outcome needs_you.
- Stay on the goal. Don't make other plans or promises.
- Before you finish, repeat the agreed day and time back once to confirm.
- Short silences are normal on the phone: people stop to check a calendar or talk to someone. Never end the call \
because of a pause. Wait; if the silence goes on, ask once whether they are still there, and wait again.
- If it is voicemail, a recorded menu you can't get through, or nobody speaks at all, finish with outcome no_answer \
without leaving a message.
- When the call has reached its end, call finish_call, then always say a short polite goodbye before the line closes \
(in Arabic, end with «مع السلامة»). Never end the call without a goodbye. Don't finish while they are still \
talking or asking something: answer them first. If they speak again after your goodbye, answer, and call \
finish_call again when it is really over. Keep the whole call under four minutes."""


def session_update(call: m.PhoneCall, voice: str, zone: ZoneInfo, model: str = MODEL) -> dict[str, Any]:
    return {
        "type": "session.update",
        "session": {
            "type": "realtime",
            "model": model,
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


def eleven_start(call: m.PhoneCall, zone: ZoneInfo, voice_id: str | None) -> dict[str, Any]:
    """The ElevenLabs agent's settings for this call: the same instructions; the fixed first words are its first message."""
    override: dict[str, Any] = {
        "agent": {
            "prompt": {"prompt": instructions(call, zone)},
            "first_message": first_words(call),
            "language": "ar" if is_arabic(call.request) else "en",
        }
    }
    if voice_id:
        override["tts"] = {"voice_id": voice_id}
    return {"type": "conversation_initiation_client_data", "conversation_config_override": override}


def eleven_url(user_id: uuid.UUID, api_key: str) -> str:
    return elevenlabs_call.phone_url(user_id, api_key, [FINISH], ELEVEN_PROMPT, TIME_LIMIT_SECONDS)


# Getting the signed URL takes one to several requests to ElevenLabs (more after a restart, when the agent is checked
# and updated). Done after they answer, that was silence on the line; so it starts while the phone rings, and the
# stream picks it up. A URL older than this isn't used (ElevenLabs keeps them valid for a while longer).
PREPARED_SECONDS = 240.0
PREPARE_WAIT_SECONDS = 10.0


@dataclass
class _Prepared:
    at: float
    done: threading.Event = field(default_factory=threading.Event)
    url: str | None = None


_prepared: dict[uuid.UUID, _Prepared] = {}
_prepared_lock = threading.Lock()


def prepare_eleven(call_id: uuid.UUID, user_id: uuid.UUID, api_key: str) -> None:
    """Fetches the call's signed URL in the background while the phone rings."""
    entry = _Prepared(time.monotonic())
    with _prepared_lock:
        for old in [key for key, value in _prepared.items() if entry.at - value.at > PREPARED_SECONDS]:
            del _prepared[old]
        _prepared[call_id] = entry

    def run() -> None:
        try:
            entry.url = eleven_url(user_id, api_key)
        except Exception as exc:  # noqa: BLE001 - the stream tries again itself and reports the error.
            log.warning("preparing the ElevenLabs call failed: %s", type(exc).__name__)
        finally:
            entry.done.set()

    threading.Thread(target=run, daemon=True).start()


def ready_eleven_url(call_id: uuid.UUID, user_id: uuid.UUID, api_key: str) -> str:
    """The URL prepared while it rang, else a new one. Blocking: run it in a thread."""
    with _prepared_lock:
        entry = _prepared.pop(call_id, None)
    fresh = entry is not None and entry.done.wait(PREPARE_WAIT_SECONDS) and time.monotonic() - entry.at < PREPARED_SECONDS
    if fresh and entry.url:
        return entry.url
    return eleven_url(user_id, api_key)


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
async def _openai(api_key: str, model: str) -> AsyncIterator[Realtime]:
    from websockets.asyncio.client import connect

    async with connect(REALTIME_URL + model, additional_headers={"Authorization": f"Bearer {api_key}"}, max_size=None) as socket:
        yield socket


@asynccontextmanager
async def _elevenlabs(signed_url: str) -> AsyncIterator[Realtime]:
    from websockets.asyncio.client import connect

    async with connect(signed_url, max_size=None) as socket:
        yield socket


# Replaced in tests with fakes.
open_realtime: Callable[[str, str], Any] = _openai
open_elevenlabs: Callable[[str], Any] = _elevenlabs


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

    def finished(self, args: Any, zone: ZoneInfo) -> None:
        """finish_call's arguments. A booking without a readable time needs the user."""
        args = args if isinstance(args, dict) else {}
        outcome = args.get("outcome") if args.get("outcome") in m.calls.OUTCOMES else "needs_you"
        moment = appointment_time(args.get("appointment_at"), zone)
        if outcome == "booked" and moment is None:
            outcome = "needs_you"
        self.outcome, self.appointment_at = outcome, moment if outcome == "booked" else None
        self.summary = _text(args.get("summary"), 1000)


# Mu-law audio louder than this (out of 32,124) is someone talking or a sound on the line; the quiet hum of an open
# line stays well under it.
SOUND_LEVEL = 800
# About ten seconds of Twilio's 20 ms frames: long enough that silence means the line isn't carrying their voice.
SILENT_FRAMES = 500
THEM_SILENT = (
    "Their side of the line was silent the whole call, so the agent couldn't hear them. This is usually the phone "
    "network on the route from your Twilio number; try again, or try another Twilio number."
)


def _loudest(payload: str) -> int:
    """The loudest sample in a frame of Twilio's base64 8 kHz mu-law audio."""
    try:
        frame = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        return 0
    loudest = 0
    for byte in set(frame):
        value = ~byte & 0xFF
        level = ((((value & 0x0F) << 3) + 0x84) << ((value >> 4) & 0x07)) - 0x84
        loudest = max(loudest, level)
    return loudest


@dataclass
class Hearing:
    """How much of the other side's audio reached Orbit: frames in all, and frames with a sound in them."""

    frames: int = 0
    loud: int = 0

    def heard(self, payload: str) -> None:
        self.frames += 1
        if _loudest(payload) > SOUND_LEVEL:
            self.loud += 1

    def check(self, result: "Result") -> None:
        log.info("call audio from their side: %d frames, %d with sound", self.frames, self.loud)
        if self.frames >= SILENT_FRAMES and not self.loud and not result.error:
            result.error = THEM_SILENT


class Twilio(Protocol):
    async def receive_text(self) -> str: ...

    async def send_text(self, data: str) -> None: ...


async def talk(twilio: Twilio, stream_sid: str, ai: Realtime, setup: dict[str, Any], zone: ZoneInfo, hang_up) -> Result:
    """Passes audio both ways until the call ends. hang_up() is awaited once the agent has said goodbye."""
    result = Result()
    hearing = Hearing()
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
                hearing.heard(media.get("payload", ""))
                await ai.send(json.dumps({"type": "input_audio_buffer.append", "audio": media.get("payload", "")}))
            elif event == "mark" and (message.get("mark") or {}).get("name") in ("goodbye", "closing"):
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
                    result.finished(json.loads(event.get("arguments") or "{}"), zone)
                except ValueError:
                    result.finished({}, zone)
                state["ending"] = True
                await ai.send(
                    json.dumps(
                        {
                            "type": "conversation.item.create",
                            "item": {
                                "type": "function_call_output",
                                "call_id": event.get("call_id"),
                                "output": json.dumps({"ok": True, "next": GOODBYE_NEXT}),
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
        # OpenAI went away while the call is still on: let what it already said play out, then hang up, so they
        # aren't left listening to silence.
        if not listening.done():
            await _close_after_playback(send_twilio, listening, end)
    finally:
        for task in tasks + timers:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
    hearing.check(result)
    return result


async def talk_elevenlabs(twilio: Twilio, stream_sid: str, ai: Realtime, start: dict[str, Any], zone: ZoneInfo, hang_up) -> Result:
    """talk(), with an ElevenLabs agent: it speaks first (its first message), ElevenLabs cuts its own audio when they
    talk over it, and finish_call comes as a client tool.

    The goodbye: after finish_call, each piece of audio is followed by a numbered mark, which Twilio sends back once
    that audio has played. ElevenLabs sends the goodbye sentence by sentence, so the latest mark coming back only means
    the line has caught up for now. Orbit hangs up once the latest mark has played and no more audio came for
    GOODBYE_QUIET_SECONDS; new audio in that time starts the wait again. GOODBYE_SECONDS is the backstop.

    If they speak after finish_call ("لا، لحظة..."), the call isn't over: the hang-up is called off and the agent
    answers them. It calls finish_call again when it is done; if it doesn't, Orbit hangs up once they have been quiet
    for REOPEN_SECONDS."""
    result = Result()
    hearing = Hearing()
    state: dict[str, Any] = {"ending": False, "hung_up": False, "marks": 0, "backstop": None}

    async def send_twilio(event: dict[str, Any]) -> None:
        await twilio.send_text(json.dumps({**event, "streamSid": stream_sid}))

    async def end() -> None:
        if not state["hung_up"]:
            state["hung_up"] = True
            await hang_up()

    async def end_later(seconds: float) -> None:
        await asyncio.sleep(seconds)
        await end()

    async def end_if_quiet(mark: int) -> None:
        await asyncio.sleep(GOODBYE_QUIET_SECONDS)
        if state["ending"] and state["marks"] == mark:
            await end()

    timers: list[asyncio.Task] = []

    def backstop(seconds: float) -> None:
        if state["backstop"] is not None:
            state["backstop"].cancel()
        state["backstop"] = asyncio.create_task(end_later(seconds))
        timers.append(state["backstop"])

    await ai.send(json.dumps(start))

    async def from_twilio() -> None:
        while True:
            try:
                message = json.loads(await twilio.receive_text())
            except WebSocketDisconnect:
                return
            event = message.get("event")
            if event == "media":
                payload = (message.get("media") or {}).get("payload", "")
                hearing.heard(payload)
                await ai.send(json.dumps({"user_audio_chunk": payload}))
            elif event == "mark":
                name = (message.get("mark") or {}).get("name")
                if name == "closing":
                    await end()
                elif state["ending"] and name == f"goodbye-{state['marks']}":
                    timers.append(asyncio.create_task(end_if_quiet(state["marks"])))
            elif event == "stop":
                return

    async def from_ai() -> None:
        async for raw in ai:
            event = json.loads(raw)
            kind = event.get("type")
            if kind == "audio":
                audio = (event.get("audio_event") or {}).get("audio_base_64")
                if audio:
                    await send_twilio({"event": "media", "media": {"payload": audio}})
                    if state["ending"]:
                        state["marks"] += 1
                        await send_twilio({"event": "mark", "mark": {"name": f"goodbye-{state['marks']}"}})
            elif kind == "interruption":
                # During the goodbye, a "طيب" from them mustn't wipe the goodbye already on its way down the line.
                if not state["ending"]:
                    await send_twilio({"event": "clear"})
            elif kind == "ping":
                await ai.send(json.dumps({"type": "pong", "event_id": (event.get("ping_event") or {}).get("event_id")}))
            elif kind == "agent_response":
                result.said("agent", (event.get("agent_response_event") or {}).get("agent_response"))
            elif kind == "user_transcript":
                words = (event.get("user_transcription_event") or {}).get("user_transcript")
                result.said("them", words)
                if isinstance(words, str) and words.strip() and (state["ending"] or state["backstop"] is not None):
                    # They are still talking: don't hang up on them. The agent answers; Orbit waits.
                    state["ending"] = False
                    backstop(REOPEN_SECONDS)
            elif kind == "client_tool_call":
                tool = event.get("client_tool_call") or {}
                reply = {"type": "client_tool_result", "tool_call_id": tool.get("tool_call_id"), "is_error": False}
                if tool.get("tool_name") != FINISH.name:
                    await ai.send(json.dumps({**reply, "result": "No such tool.", "is_error": True}))
                    continue
                args = tool.get("parameters")
                if isinstance(args, str):
                    try:
                        args = json.loads(args)
                    except ValueError:
                        args = {}
                result.finished(args, zone)
                if not state["ending"]:
                    state["ending"] = True
                    backstop(GOODBYE_SECONDS)
                await ai.send(json.dumps({**reply, "result": json.dumps({"ok": True, "next": GOODBYE_NEXT})}))

    listening = asyncio.create_task(from_twilio())
    tasks = [listening, asyncio.create_task(from_ai())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        # ElevenLabs went away (or the call hit its limit) while the call is still on: let what it already said play
        # out, then hang up.
        if not listening.done():
            await _close_after_playback(send_twilio, listening, end)
    finally:
        for task in tasks + timers:
            task.cancel()
        await asyncio.gather(*tasks, *timers, return_exceptions=True)
    hearing.check(result)
    return result


async def _close_after_playback(send_twilio, listening: asyncio.Task, end) -> None:
    """The AI's side is gone but the call is on: Twilio sends the "closing" mark back once the audio before it has
    played (and the listener then hangs up); CLOSE_SECONDS is the backstop."""
    with contextlib.suppress(Exception):
        await send_twilio({"event": "mark", "mark": {"name": "closing"}})
    await asyncio.wait([listening], timeout=CLOSE_SECONDS)
    await end()


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
