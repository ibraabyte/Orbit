"""Calls the agent makes for the user: set up Twilio, plan a call, approve it, follow it, read the result.

/calls/setup      the user's own Twilio account (SID, auth token, the number calls go out from) and the agent's voice.
POST /calls       turns what the user asked for into a plan (a draft). Nothing rings yet.
PATCH /calls/{id} changes the plan while it is a draft.
POST /calls/{id}/start   the user's approval: only this starts the call.
POST /calls/{id}/hang-up stops it at any time.
Twilio then posts the call's progress to /calls/twilio/status/{id} (checked against the user's auth token) and streams
its audio to the /calls/stream websocket, where app.services.phone_agent talks. A booked appointment becomes a task.
"""

import asyncio
import contextlib
import hashlib
import json
import re
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from urllib.parse import parse_qsl
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, HTTPException, Query, Request, Response, WebSocket, WebSocketDisconnect, status
from pydantic import BaseModel, ConfigDict, StringConstraints, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.crud import get_owned
from app.db import get_sessionmaker
from app.deps import Db, UserId
from app.models import PhoneCall, PhoneConnection, Profile
from app.models.calls import ACTIVE_STATUSES, PHONE_PATTERN
from app.security import decrypt_secret, encrypt_secret
from app.services import phone_agent, twilio

router = APIRouter(prefix="/calls", tags=["calls"])

Phone = Annotated[str, StringConstraints(strip_whitespace=True, pattern=PHONE_PATTERN)]
_SID = re.compile(r"^AC[0-9a-fA-F]{32}$")


def _phone(value: str) -> str:
    """+966 5x xxx xxxx and 05xxxxxxxx (a Saudi mobile) both become +9665xxxxxxxx."""
    digits = re.sub(r"[\s\-().]", "", value or "")
    if digits.startswith("00"):
        digits = "+" + digits[2:]
    if re.fullmatch(r"05[0-9]{8}", digits):
        digits = "+966" + digits[1:]
    return digits


class SetupStatus(BaseModel):
    connected: bool
    # Only the end of the SID, to tell accounts apart. The token never comes back.
    account_hint: str | None = None
    from_number: str | None = None
    voice: str = phone_agent.VOICES[0]
    # The user's own OpenAI key is saved (Integrations > AI or Voice): the agent's voice needs it.
    openai: bool
    ready: bool
    voices: list[str] = list(phone_agent.VOICES)


class SetupIn(BaseModel):
    account_sid: Annotated[str, StringConstraints(strip_whitespace=True)]
    # Empty keeps the saved token (changing only the number or voice).
    auth_token: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)] = ""
    from_number: str
    voice: Literal[phone_agent.VOICES] = phone_agent.VOICES[0]  # type: ignore[valid-type]

    @field_validator("from_number")
    @classmethod
    def _from(cls, value: str) -> str:
        value = _phone(value)
        if not re.fullmatch(PHONE_PATTERN, value):
            raise ValueError("Write the number with its country code, like +9665XXXXXXXX.")
        return value


class CallIn(BaseModel):
    request: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    business_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""
    to_number: str

    @field_validator("to_number")
    @classmethod
    def _to(cls, value: str) -> str:
        value = _phone(value)
        if not re.fullmatch(PHONE_PATTERN, value):
            raise ValueError("Write the number with its country code, like +9665XXXXXXXX or 05XXXXXXXX.")
        return value


class CallUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    business_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)] | None = None
    to_number: str | None = None
    goal: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)] | None = None
    opening: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)] | None = None
    allowed: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None
    caller_name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=60)] | None = None

    _to = field_validator("to_number")(CallIn._to.__func__)  # type: ignore[attr-defined]


class Line(BaseModel):
    who: Literal["agent", "them"]
    text: str


class CallOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    business_name: str
    to_number: str
    request: str
    goal: str
    # The agent's fixed first words (who is calling, for whom), then the opening.
    disclosure: str
    opening: str
    allowed: str | None
    caller_name: str | None
    status: str
    outcome: str | None
    appointment_at: datetime | None
    summary: str | None
    transcript: list[Line]
    error: str | None
    task_id: uuid.UUID | None
    duration_seconds: int | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime


def _out(call: PhoneCall) -> CallOut:
    data = {name: getattr(call, name) for name in CallOut.model_fields if name != "disclosure"}
    return CallOut(**data, disclosure=phone_agent.disclosure(call.caller_name, phone_agent.is_arabic(call.request)))


def _zone(db: Session, user_id: uuid.UUID) -> ZoneInfo:
    profile = db.get(Profile, user_id)
    try:
        return ZoneInfo(profile.timezone if profile else "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _setup_status(db: Session, user_id: uuid.UUID) -> SetupStatus:
    row = db.get(PhoneConnection, user_id)
    has_openai = phone_agent.openai_key(db, user_id) is not None
    if row is None:
        return SetupStatus(connected=False, openai=has_openai, ready=False)
    return SetupStatus(
        connected=True, account_hint=row.account_sid[-4:], from_number=row.from_number, voice=row.voice, openai=has_openai, ready=has_openai
    )


def _twilio_failure(exc: twilio.TwilioUnavailable) -> HTTPException:
    # Never 401: the app would take that as "your Orbit session ended".
    return HTTPException(status.HTTP_409_CONFLICT if isinstance(exc, twilio.TwilioKeyRejected) else status.HTTP_502_BAD_GATEWAY, str(exc))


@router.get("/setup", response_model=SetupStatus)
def setup_status(user_id: UserId, db: Db):
    return _setup_status(db, user_id)


@router.put("/setup", response_model=SetupStatus)
def save_setup(body: SetupIn, user_id: UserId, db: Db):
    """Checks the account and that calls may go out from this number (a Twilio number or a verified caller ID)."""
    if not _SID.fullmatch(body.account_sid):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The account SID starts with AC and has 34 characters.")
    row = db.get(PhoneConnection, user_id)
    token = body.auth_token or (decrypt_secret(row.auth_token) if row and row.account_sid == body.account_sid else None)
    if not token:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Add the auth token from your Twilio console.")
    try:
        twilio.check_account(body.account_sid, token)
        usable = twilio.number_usable(body.account_sid, token, body.from_number)
    except twilio.TwilioUnavailable as exc:
        raise _twilio_failure(exc) from exc
    if not usable:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "This number isn't in your Twilio account. Buy it, or verify your own mobile under Phone Numbers > Verified Caller IDs.",
        )
    if row is None:
        row = PhoneConnection(user_id=user_id)
        db.add(row)
    row.account_sid, row.auth_token, row.from_number, row.voice = body.account_sid, encrypt_secret(token), body.from_number, body.voice
    db.commit()
    return _setup_status(db, user_id)


@router.delete("/setup", status_code=status.HTTP_204_NO_CONTENT)
def remove_setup(user_id: UserId, db: Db):
    """Forgets the Twilio account. Past calls stay."""
    row = db.get(PhoneConnection, user_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("", response_model=list[CallOut])
def list_calls(user_id: UserId, db: Db, limit: int = Query(50, ge=1, le=200)):
    rows = db.scalars(
        select(PhoneCall).where(PhoneCall.user_id == user_id).order_by(PhoneCall.created_at.desc(), PhoneCall.id).limit(limit)
    )
    return [_out(row) for row in rows]


@router.post("", response_model=CallOut, status_code=status.HTTP_201_CREATED)
def plan_call(body: CallIn, user_id: UserId, db: Db):
    """A draft call with a plan the user reads before approving. Uses their own AI if they have one."""
    plan = phone_agent.make_plan(db, user_id, body.request, body.business_name or None, _zone(db, user_id))
    profile = db.get(Profile, user_id)
    name = (profile.display_name or "").strip()[:60] if profile else ""
    call = PhoneCall(
        user_id=user_id,
        business_name=plan.business_name,
        to_number=body.to_number,
        request=body.request,
        goal=plan.goal,
        opening=plan.opening,
        allowed=plan.allowed,
        caller_name=name or None,
        task_title=plan.task_title,
    )
    db.add(call)
    db.commit()
    db.refresh(call)
    return _out(call)


@router.get("/{call_id}", response_model=CallOut)
def get_call(call_id: uuid.UUID, user_id: UserId, db: Db):
    return _out(get_owned(db, PhoneCall, call_id, user_id))


@router.patch("/{call_id}", response_model=CallOut)
def change_plan(call_id: uuid.UUID, body: CallUpdate, user_id: UserId, db: Db):
    call = get_owned(db, PhoneCall, call_id, user_id)
    if call.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "This call already started; its plan can't change.")
    for name, value in body.model_dump(exclude_unset=True).items():
        if value is None and name in ("business_name", "to_number", "goal", "opening"):
            continue
        setattr(call, name, value or None if name in ("allowed", "caller_name") else value)
    db.commit()
    db.refresh(call)
    return _out(call)


@router.delete("/{call_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_call(call_id: uuid.UUID, user_id: UserId, db: Db):
    call = get_owned(db, PhoneCall, call_id, user_id)
    if call.status in ACTIVE_STATUSES:
        raise HTTPException(status.HTTP_409_CONFLICT, "Hang up first.")
    db.delete(call)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _stream_url(request: Request) -> str:
    # Behind Coolify's proxy the forwarded scheme is https, so this is wss://.
    url = str(request.url_for("call_stream"))
    for plain, secure in (("http://", "ws://"), ("https://", "wss://")):
        if url.startswith(plain):
            return secure + url.removeprefix(plain)
    return url


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


@router.post("/{call_id}/start", response_model=CallOut)
def start_call(call_id: uuid.UUID, request: Request, user_id: UserId, db: Db):
    """The user approved the plan they were shown: now the phone rings."""
    call = get_owned(db, PhoneCall, call_id, user_id)
    if call.status != "draft":
        raise HTTPException(status.HTTP_409_CONFLICT, "This call already started.")
    setup = db.get(PhoneConnection, user_id)
    token = decrypt_secret(setup.auth_token) if setup else None
    if setup is None or not token:
        raise HTTPException(status.HTTP_409_CONFLICT, "Set up your Twilio account first.")
    if phone_agent.openai_key(db, user_id) is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Add your OpenAI key in Integrations first: the agent's voice uses it.")
    active = db.scalar(select(func.count()).where(PhoneCall.user_id == user_id, PhoneCall.status.in_(ACTIVE_STATUSES)))
    if active:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another call is still on the line. Wait for it to end.")
    since = datetime.now(UTC) - timedelta(days=1)
    today = db.scalar(select(func.count()).where(PhoneCall.user_id == user_id, PhoneCall.started_at >= since))
    if today >= phone_agent.CALLS_PER_DAY:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"That's {phone_agent.CALLS_PER_DAY} calls in a day. Try again tomorrow.")
    key = secrets.token_urlsafe(32)
    twiml = twilio.stream_twiml(_stream_url(request), {"call_id": str(call.id), "key": key})
    try:
        sid = twilio.create_call(
            setup.account_sid,
            token,
            to=call.to_number,
            from_=setup.from_number,
            twiml=twiml,
            status_url=str(request.url_for("call_status", call_id=call.id)),
            time_limit=phone_agent.TIME_LIMIT_SECONDS,
            ring_seconds=phone_agent.RING_SECONDS,
        )
    except twilio.TwilioUnavailable as exc:
        raise _twilio_failure(exc) from exc
    call.status, call.twilio_sid, call.stream_key, call.started_at = "calling", sid, _hash(key), datetime.now(UTC)
    db.commit()
    db.refresh(call)
    return _out(call)


@router.post("/{call_id}/hang-up", response_model=CallOut)
def hang_up(call_id: uuid.UUID, user_id: UserId, db: Db):
    call = get_owned(db, PhoneCall, call_id, user_id)
    if call.status not in ACTIVE_STATUSES:
        return _out(call)
    setup = db.get(PhoneConnection, user_id)
    token = decrypt_secret(setup.auth_token) if setup else None
    if setup and token and call.twilio_sid:
        try:
            twilio.end_call(setup.account_sid, token, call.twilio_sid, ringing=call.status == "calling")
        except twilio.TwilioUnavailable as exc:
            raise _twilio_failure(exc) from exc
    if call.status == "calling":
        call.status = "canceled"
        call.ended_at = datetime.now(UTC)
    db.commit()
    db.refresh(call)
    return _out(call)


def _finish(db: Session, call: PhoneCall) -> None:
    """Once the call is over: a booked appointment becomes a task (once)."""
    if call.outcome == "booked" and call.appointment_at and call.task_id is None:
        task = phone_agent.booked_task(call)
        db.add(task)
        db.flush()
        call.task_id = task.id


# Twilio's call status -> ours. Statuses not listed (queued, initiated, ringing) leave it "calling".
_STATUS = {
    "in-progress": "in_progress",
    "completed": "ended",
    "busy": "ended",
    "no-answer": "ended",
    "failed": "failed",
    "canceled": "canceled",
}


@router.post("/twilio/status/{call_id}", name="call_status", include_in_schema=False)
async def twilio_status(call_id: uuid.UUID, request: Request):
    """Twilio's progress updates. Only ones signed with this user's auth token count."""
    params = dict(parse_qsl((await request.body()).decode(), keep_blank_values=True))
    with get_sessionmaker()() as db:
        call = db.get(PhoneCall, call_id, with_for_update=True)
        setup = db.get(PhoneConnection, call.user_id) if call else None
        token = decrypt_secret(setup.auth_token) if setup else None
        url = str(request.url_for("call_status", call_id=call_id))
        if call is None or not token or not twilio.signature_valid(token, url, params, request.headers.get("X-Twilio-Signature")):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Not from Twilio.")
        if params.get("CallSid") != call.twilio_sid:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        twilio_status = params.get("CallStatus", "")
        ours = _STATUS.get(twilio_status)
        if ours and call.status in ACTIVE_STATUSES:
            call.status = ours
        if twilio_status in ("busy", "no-answer") and call.outcome is None:
            call.outcome = "no_answer"
        if twilio_status == "failed":
            call.error = call.error or "The call didn't go through."
        if ours in ("ended", "failed", "canceled"):
            call.ended_at = call.ended_at or datetime.now(UTC)
            call.stream_key = None
            if params.get("CallDuration", "").isdigit():
                call.duration_seconds = int(params["CallDuration"])
            _finish(db, call)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _claim(call_id: str, key: str) -> tuple[PhoneCall, str, str, tuple[str, str], ZoneInfo] | None:
    """The call this stream belongs to, if its one-time key matches. The key can't be used twice."""
    try:
        parsed = uuid.UUID(call_id)
    except ValueError:
        return None
    with get_sessionmaker()() as db:
        call = db.get(PhoneCall, parsed)
        if (
            call is None
            or not call.stream_key
            or not secrets.compare_digest(call.stream_key, _hash(key))
            or call.status not in ACTIVE_STATUSES
        ):
            return None
        setup = db.get(PhoneConnection, call.user_id)
        api_key = phone_agent.openai_key(db, call.user_id)
        token = decrypt_secret(setup.auth_token) if setup else None
        if setup is None or api_key is None or token is None:
            return None
        call.stream_key = None
        call.status = "in_progress"
        db.commit()
        db.refresh(call)
        return call, api_key, setup.voice, (setup.account_sid, token), _zone(db, call.user_id)


def _save(call_id: uuid.UUID, result: phone_agent.Result) -> None:
    with get_sessionmaker()() as db:
        call = db.get(PhoneCall, call_id, with_for_update=True)
        if call is None:
            return
        call.transcript = result.transcript
        if result.outcome:
            call.outcome, call.appointment_at, call.summary = result.outcome, result.appointment_at, result.summary
        elif call.outcome is None:
            call.outcome = "needs_you" if result.transcript else "no_answer"
        if result.error:
            call.error = result.error
        _finish(db, call)
        db.commit()


@router.websocket("/stream", name="call_stream")
async def call_stream(socket: WebSocket):
    """Twilio's audio for one call, both ways. It names its call and one-time key in the stream's start message."""
    await socket.accept()
    try:
        start: dict = {}
        while not start:
            message = json.loads(await asyncio.wait_for(socket.receive_text(), timeout=10))
            if message.get("event") == "start":
                start = message.get("start") or {}
        params = start.get("customParameters") or {}
        claimed = await asyncio.to_thread(_claim, str(params.get("call_id", "")), str(params.get("key", "")))
        if claimed is None:
            await socket.close(code=1008)
            return
        call, api_key, voice, (account_sid, token), zone = claimed

        async def hang_up_now() -> None:
            try:
                await asyncio.to_thread(twilio.end_call, account_sid, token, call.twilio_sid or "")
            except twilio.TwilioUnavailable:
                phone_agent.log.warning("hanging up through Twilio failed")

        setup = phone_agent.session_update(call, voice, zone)
        try:
            async with phone_agent.open_realtime(api_key) as ai:
                result = await phone_agent.talk(socket, str(start.get("streamSid", "")), ai, setup, zone, hang_up_now)
        except (OSError, TimeoutError) as exc:
            result = phone_agent.Result(error="Couldn't reach OpenAI from the server.")
            phone_agent.log.warning("realtime connect failed: %s", type(exc).__name__)
            await hang_up_now()
        except Exception as exc:  # noqa: BLE001 - a refused key must still end the call cleanly.
            phone_agent.log.warning("call failed: %s", type(exc).__name__)
            result = phone_agent.Result(error="The call stopped because of an error.")
            await hang_up_now()
        await asyncio.to_thread(_save, call.id, result)
    except (WebSocketDisconnect, TimeoutError, ValueError):
        return
    with contextlib.suppress(RuntimeError):
        await socket.close()
