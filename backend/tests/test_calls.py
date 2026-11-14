"""The phone agent: setting up Twilio, planning and approving a call, Twilio's updates, and the live call itself.

Twilio and OpenAI are fakes (httpx2.MockTransport and a scripted realtime socket). Every number, SID, token and key
here is made up.
"""

import asyncio
import json
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from urllib.parse import parse_qsl, urlencode

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import AiConnection, PhoneCall, PhoneConnection, Task
from app.security import decrypt_secret, encrypt_secret
from app.services import phone_agent, twilio
from tests.conftest import bearer, sign_up

SID = "AC" + "0" * 31 + "1"
TOKEN = "made-up-twilio-token"
OWN_NUMBER = "+966500000001"
SHOP = "+966500000002"
CALL_SID = "CA" + "f" * 32


@pytest.fixture
def twilio_api(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[httpx.Request]]:
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        expected = httpx.BasicAuth(SID, TOKEN)
        if request.headers.get("Authorization") != next(expected.auth_flow(httpx.Request("GET", "https://x"))).headers["Authorization"]:
            return httpx.Response(401, json={"code": 20003})
        path = request.url.path
        if path.endswith("/IncomingPhoneNumbers.json"):
            return httpx.Response(200, json={"incoming_phone_numbers": []})
        if path.endswith("/OutgoingCallerIds.json"):
            found = request.url.params.get("PhoneNumber") == OWN_NUMBER
            return httpx.Response(200, json={"outgoing_caller_ids": [{"phone_number": OWN_NUMBER}] if found else []})
        if path.endswith("/Calls.json"):
            form = dict(parse_qsl(request.content.decode()))
            if form["To"] == "+966500000009":
                return httpx.Response(400, json={"code": 21215})
            return httpx.Response(201, json={"sid": CALL_SID})
        if "/Calls/" in path:
            return httpx.Response(200, json={"sid": CALL_SID, "status": "completed"})
        return httpx.Response(200, json={"sid": SID})

    monkeypatch.setattr(twilio, "transport", httpx.MockTransport(handler))
    yield calls


@pytest.fixture
def auth(client: TestClient) -> dict:
    return bearer(sign_up(client))


def _user_id(client: TestClient, auth: dict) -> uuid.UUID:
    return uuid.UUID(client.get("/auth/me", headers=auth).json()["id"])


def _openai(db: Session, user_id: uuid.UUID) -> None:
    db.add(AiConnection(user_id=user_id, provider="openai", model="gpt-made-up", api_key=encrypt_secret("made-up-openai-key")))
    db.commit()


def _setup(client: TestClient, auth: dict) -> None:
    response = client.put("/calls/setup", json={"account_sid": SID, "auth_token": TOKEN, "from_number": "0500000001"}, headers=auth)
    assert response.status_code == 200, response.text


def _draft(client: TestClient, auth: dict, **extra) -> dict:
    body = {"request": "احجز لي موعد حلاق بكرا العصر", "business_name": "الحلاق", "to_number": "050 000 0002", **extra}
    response = client.post("/calls", json=body, headers=auth)
    assert response.status_code == 201, response.text
    return response.json()


def test_setup_checks_account_and_number(client: TestClient, auth: dict, twilio_api, db: Session):
    status = client.get("/calls/setup", headers=auth).json()
    assert status["connected"] is False and status["ready"] is False

    wrong = client.put("/calls/setup", json={"account_sid": SID, "auth_token": "nope", "from_number": OWN_NUMBER}, headers=auth)
    assert wrong.status_code == 409
    bad_sid = client.put("/calls/setup", json={"account_sid": "AC12", "auth_token": TOKEN, "from_number": OWN_NUMBER}, headers=auth)
    assert bad_sid.status_code == 422
    not_theirs = client.put("/calls/setup", json={"account_sid": SID, "auth_token": TOKEN, "from_number": "+966511111111"}, headers=auth)
    assert not_theirs.status_code == 422 and "Verified Caller IDs" in not_theirs.json()["detail"]

    _setup(client, auth)
    status = client.get("/calls/setup", headers=auth).json()
    # 05... is a Saudi mobile, kept as +9665...; the token never comes back, only the SID's end.
    assert status["connected"] and status["from_number"] == OWN_NUMBER and status["account_hint"] == SID[-4:]
    assert TOKEN not in json.dumps(status)
    assert status["ready"] is False and status["openai"] is False
    row = db.get(PhoneConnection, _user_id(client, auth))
    assert row.auth_token != TOKEN and decrypt_secret(row.auth_token) == TOKEN

    # Changing only the voice keeps the saved token.
    again = client.put("/calls/setup", json={"account_sid": SID, "from_number": OWN_NUMBER, "voice": "cedar"}, headers=auth)
    assert again.status_code == 200 and again.json()["voice"] == "cedar"

    _openai(db, _user_id(client, auth))
    assert client.get("/calls/setup", headers=auth).json()["ready"] is True
    assert client.delete("/calls/setup", headers=auth).status_code == 204
    assert client.get("/calls/setup", headers=auth).json()["connected"] is False


def test_plan_without_ai_uses_the_request(client: TestClient, auth: dict):
    call = _draft(client, auth)
    assert call["status"] == "draft"
    assert call["to_number"] == SHOP
    assert call["goal"] == "احجز لي موعد حلاق بكرا العصر"
    # The fixed first words always say it's an automated assistant.
    assert "مساعد آلي" in call["disclosure"]
    assert client.get("/calls", headers=auth).json()[0]["id"] == call["id"]
    assert client.post("/calls", json={"request": "x", "to_number": "112"}, headers=auth).status_code == 422


def test_plan_from_the_users_ai(client: TestClient, auth: dict, db: Session, monkeypatch: pytest.MonkeyPatch):
    _openai(db, _user_id(client, auth))
    answer = {
        "business_name": "صالون",
        "goal": "حجز حلاقة يوم الأحد",
        "opening": "ودي أحجز موعد حلاقة بكرا العصر، عندكم وقت؟",
        "allowed": "الأحد بين ٣ و٦ العصر",
        "task_title": "موعد الحلاق",
    }
    monkeypatch.setattr(phone_agent.assistant, "complete", lambda *args, **kwargs: "Here:\n" + json.dumps(answer, ensure_ascii=False))
    call = _draft(client, auth, business_name="")
    assert call["business_name"] == "صالون" and call["allowed"] == "الأحد بين ٣ و٦ العصر"
    assert call["opening"].startswith("ودي أحجز")


def test_plan_can_change_until_it_starts(client: TestClient, auth: dict, twilio_api, db: Session):
    call = _draft(client, auth)
    changed = client.patch(f"/calls/{call['id']}", json={"allowed": "بعد العصر فقط", "caller_name": "سالم"}, headers=auth)
    assert changed.status_code == 200
    assert changed.json()["disclosure"] == "السلام عليكم، معك مساعد آلي أتصل نيابة عن سالم."
    assert client.patch(f"/calls/{call['id']}", json={"price": 5}, headers=auth).status_code == 422

    _setup(client, auth)
    _openai(db, _user_id(client, auth))
    assert client.post(f"/calls/{call['id']}/start", headers=auth).status_code == 200
    assert client.patch(f"/calls/{call['id']}", json={"goal": "x"}, headers=auth).status_code == 409


def test_start_needs_setup_and_openai(client: TestClient, auth: dict, twilio_api, db: Session):
    call = _draft(client, auth)
    assert "Twilio" in client.post(f"/calls/{call['id']}/start", headers=auth).json()["detail"]
    _setup(client, auth)
    assert "OpenAI" in client.post(f"/calls/{call['id']}/start", headers=auth).json()["detail"]
    assert client.get(f"/calls/{call['id']}", headers=auth).json()["status"] == "draft"
    assert not any(request.url.path.endswith("/Calls.json") for request in twilio_api)


def test_start_rings_with_a_stream_and_limits(client: TestClient, auth: dict, twilio_api, db: Session):
    _setup(client, auth)
    _openai(db, _user_id(client, auth))
    call = _draft(client, auth)
    started = client.post(f"/calls/{call['id']}/start", headers=auth)
    assert started.status_code == 200, started.text
    assert started.json()["status"] == "calling"
    create = next(request for request in twilio_api if request.url.path.endswith("/Calls.json"))
    form = dict(parse_qsl(create.content.decode()))
    assert form["To"] == SHOP and form["From"] == OWN_NUMBER
    assert form["TimeLimit"] == str(phone_agent.TIME_LIMIT_SECONDS)
    assert '<Stream url="ws://testserver/calls/stream">' in form["Twiml"]
    assert f'<Parameter name="call_id" value="{call["id"]}"/>' in form["Twiml"]
    assert form["StatusCallback"] == f"http://testserver/calls/twilio/status/{call['id']}"
    row = db.get(PhoneCall, uuid.UUID(call["id"]))
    assert row.twilio_sid == CALL_SID and row.stream_key

    # One call on the line at a time; it can't start twice or be deleted while on.
    other = _draft(client, auth)
    assert client.post(f"/calls/{other['id']}/start", headers=auth).status_code == 409
    assert client.post(f"/calls/{call['id']}/start", headers=auth).status_code == 409
    assert client.delete(f"/calls/{call['id']}", headers=auth).status_code == 409

    hung = client.post(f"/calls/{call['id']}/hang-up", headers=auth)
    assert hung.json()["status"] == "canceled"
    assert dict(parse_qsl(twilio_api[-1].content.decode())) == {"Status": "canceled"}


def test_twilio_error_is_explained(client: TestClient, auth: dict, twilio_api, db: Session):
    _setup(client, auth)
    _openai(db, _user_id(client, auth))
    call = _draft(client, auth, to_number="+966500000009")
    response = client.post(f"/calls/{call['id']}/start", headers=auth)
    assert response.status_code == 502 and "Geo permissions" in response.json()["detail"]
    assert client.get(f"/calls/{call['id']}", headers=auth).json()["status"] == "draft"


def test_calls_are_private(client: TestClient, auth: dict):
    call = _draft(client, auth)
    other = bearer(sign_up(client, email="other@example.com"))
    assert client.get(f"/calls/{call['id']}", headers=other).status_code == 404
    assert client.post(f"/calls/{call['id']}/start", headers=other).status_code == 404
    assert client.get("/calls", headers=other).json() == []


def _started(client: TestClient, auth: dict, db: Session) -> dict:
    _setup(client, auth)
    _openai(db, _user_id(client, auth))
    call = _draft(client, auth)
    assert client.post(f"/calls/{call['id']}/start", headers=auth).status_code == 200
    return call


def _status(client: TestClient, call_id: str, token: str = TOKEN, **fields) -> int:
    url = f"http://testserver/calls/twilio/status/{call_id}"
    params = {"CallSid": CALL_SID, **fields}
    headers = {"X-Twilio-Signature": twilio.signature(token, url, params), "Content-Type": "application/x-www-form-urlencoded"}
    return client.post(f"/calls/twilio/status/{call_id}", content=urlencode(params), headers=headers).status_code


def test_status_updates_must_be_signed(client: TestClient, auth: dict, twilio_api, db: Session):
    call = _started(client, auth, db)
    assert _status(client, call["id"], token="someone-else", CallStatus="completed") == 403
    assert client.get(f"/calls/{call['id']}", headers=auth).json()["status"] == "calling"

    assert _status(client, call["id"], CallStatus="no-answer", CallDuration="0") == 204
    after = client.get(f"/calls/{call['id']}", headers=auth).json()
    assert after["status"] == "ended" and after["outcome"] == "no_answer" and after["ended_at"]


def test_twilio_signature_matches_twilios_example():
    # The example from Twilio's webhook security docs.
    url = "https://mycompany.com/myapp.php?foo=1&bar=2"
    params = {"CallSid": "CA1234567890ABCDE", "Caller": "+12349013030", "Digits": "1234", "From": "+12349013030", "To": "+18005551212"}
    assert twilio.signature("12345", url, params) == "0/KCTR6DLpKmkAf8muzZqo1nDgQ="


class FakeOpenAI:
    """Answers like OpenAI Realtime: greets, hears them, books, says goodbye."""

    def __init__(self, booked_at: str) -> None:
        self.sent: list[dict] = []
        self.out: asyncio.Queue[dict | None] = asyncio.Queue()
        self.booked_at = booked_at
        self.heard = 0

    async def send(self, message: str) -> None:
        event = json.loads(message)
        self.sent.append(event)
        put = self.out.put_nowait
        if event["type"] == "response.create" and len([e for e in self.sent if e["type"] == "response.create"]) == 1:
            put({"type": "response.output_audio.delta", "item_id": "a1", "delta": "QUJD"})
            put({"type": "response.output_audio_transcript.done", "transcript": "السلام عليكم، معك مساعد آلي"})
            put({"type": "response.done", "response": {"output": [{"type": "message"}]}})
        elif event["type"] == "input_audio_buffer.append":
            self.heard += 1
            if self.heard == 1:
                put({"type": "input_audio_buffer.speech_started"})
                put({"type": "conversation.item.input_audio_transcription.completed", "transcript": "أبشر، الساعة أربع تناسبك؟"})
                args = {"outcome": "booked", "appointment_at": self.booked_at, "summary": "تم الحجز الساعة ٤ العصر."}
                put(
                    {"type": "response.function_call_arguments.done", "name": "finish_call", "call_id": "f1", "arguments": json.dumps(args)}
                )
                put({"type": "response.done", "response": {"output": [{"type": "function_call"}]}})
        elif event["type"] == "response.create":
            put({"type": "response.output_audio_transcript.done", "transcript": "شكراً، مع السلامة"})
            put({"type": "response.done", "response": {"output": [{"type": "message"}]}})

    def __aiter__(self) -> AsyncIterator[str]:
        return self._events()

    async def _events(self) -> AsyncIterator[str]:
        while (event := await self.out.get()) is not None:
            yield json.dumps(event)


def test_live_call_books_and_makes_a_task(client: TestClient, auth: dict, twilio_api, db: Session, monkeypatch: pytest.MonkeyPatch):
    call = _started(client, auth, db)
    key = next(request for request in twilio_api if request.url.path.endswith("/Calls.json"))
    twiml = dict(parse_qsl(key.content.decode()))["Twiml"]
    stream_key = twiml.split('name="key" value="')[1].split('"')[0]
    fake = FakeOpenAI("2030-01-06T16:00")
    keys: list[str] = []
    models: list[str] = []

    @asynccontextmanager
    async def fake_open(api_key: str, model: str):
        keys.append(api_key)
        models.append(model)
        yield fake

    monkeypatch.setattr(phone_agent, "open_realtime", fake_open)
    start = {
        "event": "start",
        "start": {"streamSid": "MZ1", "callSid": CALL_SID, "customParameters": {"call_id": call["id"], "key": stream_key}},
    }
    with client.websocket_connect("/calls/stream") as socket:
        socket.send_json({"event": "connected"})
        socket.send_json(start)
        greeting = socket.receive_json()
        assert greeting == {"event": "media", "media": {"payload": "QUJD"}, "streamSid": "MZ1"}
        socket.send_json({"event": "media", "media": {"payload": "AAAA", "timestamp": "400"}})
        # They talk over the agent: its audio is cleared at once.
        assert socket.receive_json() == {"event": "clear", "streamSid": "MZ1"}
        assert socket.receive_json() == {"event": "mark", "mark": {"name": "goodbye"}, "streamSid": "MZ1"}
        socket.send_json({"event": "mark", "mark": {"name": "goodbye"}})
        socket.send_json({"event": "stop"})
        # The server saves the call, then closes the stream.
        with pytest.raises(Exception):  # noqa: B017 - closed by the server
            socket.receive_json()

    assert keys == ["made-up-openai-key"]
    # Nothing picked in Integrations: the default realtime model.
    assert models == ["gpt-realtime"]
    setup = fake.sent[0]
    assert setup["session"]["model"] == "gpt-realtime"
    assert setup["type"] == "session.update"
    assert setup["session"]["audio"]["input"]["format"] == {"type": "audio/pcmu"}
    assert "Never pay" in setup["session"]["instructions"] and "مساعد آلي" in setup["session"]["instructions"]
    assert any(event["type"] == "conversation.item.truncate" and event["audio_end_ms"] == 400 for event in fake.sent)
    # Orbit hung up through Twilio after the goodbye.
    assert dict(parse_qsl(twilio_api[-1].content.decode())) == {"Status": "completed"}

    done = client.get(f"/calls/{call['id']}", headers=auth).json()
    assert done["outcome"] == "booked"
    assert done["appointment_at"].startswith("2030-01-06T13:00")  # 16:00 in Riyadh
    assert [line["who"] for line in done["transcript"]] == ["agent", "them", "agent"]
    task = db.get(Task, uuid.UUID(done["task_id"]))
    assert task.title.startswith("موعد") and task.due_at == datetime(2030, 1, 6, 13, 0, tzinfo=UTC)
    assert task.reminder_at == datetime(2030, 1, 6, 12, 0, tzinfo=UTC)

    # The key worked once; a second stream with it is refused.
    with client.websocket_connect("/calls/stream") as socket:
        socket.send_json(start)
        with pytest.raises(Exception):  # noqa: B017 - the server closes the socket
            socket.receive_json()

    # The final status update doesn't make a second task.
    assert _status(client, call["id"], CallStatus="completed", CallDuration="95") == 204
    again = client.get(f"/calls/{call['id']}", headers=auth).json()
    assert again["task_id"] == done["task_id"] and again["status"] == "ended" and again["duration_seconds"] == 95
    assert db.query(Task).count() == 1
    assert db.get(PhoneCall, uuid.UUID(call["id"])).stream_key is None
