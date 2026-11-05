"""The assistant's one AI entry point and the morning brief built on it. Providers are fakes; every key is made up."""

import json
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AiConnection, Bill, Budget, Expense, Reminder, SleepLog, Task, User, WhoopCycle, WhoopRecovery, WhoopSleep
from app.routers import assistant as assistant_router
from app.security import encrypt_secret
from app.services import assistant, chatgpt_ai, chatgpt_auth, whoop_ai
from tests.conftest import bearer, sign_up

KEY = "made-up-ai-key-0001"
OPENAI = {"provider": "openai", "model": "made-up-model", "api_key": KEY}
TODAY = date(2026, 11, 3)
BODY = {"date": "2026-11-03", "locale": "en"}
# Riyadh is UTC+3: 09:00 local is 06:00 UTC.
RIYADH = timedelta(hours=3)


@pytest.fixture(autouse=True)
def server_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(assistant_router, "utc_today", lambda: TODAY)


def local(day: str, hour: int = 9) -> datetime:
    return datetime.fromisoformat(f"{day}T{hour:02d}:00:00+00:00") - RIYADH


class Requests(list):
    reply = ["Good morning. Two tasks are due."]


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> Iterator[Requests]:
    """Plain-text answers; `provider.reply` changes what the AI says."""
    requests = Requests()
    requests.reply = reply = ["Good morning. Two tasks are due."]

    def handler(request: httpx.Request) -> httpx.Response:
        if request.headers.get("Authorization") != f"Bearer {KEY}":
            return httpx.Response(401, json={"error": {"message": "bad key"}})
        body = json.loads(request.content)
        requests.append(body)
        return httpx.Response(200, json={"model": body["model"], "choices": [{"finish_reason": "stop", "message": {"content": reply[0]}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    yield requests


def connect(client: TestClient, auth: dict, provider: list, **extra) -> None:
    assert client.put("/integrations/ai", json={**OPENAI, **extra}, headers=auth).status_code == 200
    provider.clear()  # the key check is a request too


def user_id(db: Session, email: str = "me@example.com"):
    return db.scalar(select(User.id).where(User.email == email))


def add(db: Session, *rows) -> None:
    db.add_all(rows)
    db.commit()


# The one entry point


def test_complete_sends_system_with_the_users_instructions_and_returns_text(provider):
    access = whoop_ai.AiAccess("openai", "made-up-model", KEY, "Keep it formal")
    assert assistant.complete(access, "Be brief.", "Hello") == "Good morning. Two tasks are due."
    body = provider[0]
    assert body["messages"][0]["role"] == "system" and "Be brief." in body["messages"][0]["content"]
    assert "Keep it formal" in body["messages"][0]["content"]
    assert body["messages"][1] == {"role": "user", "content": "Hello"}
    # Plain text, not the WHOOP JSON schema.
    assert "response_format" not in body


def test_complete_without_instructions_sends_the_system_text_as_is(provider):
    assistant.complete(whoop_ai.AiAccess("openai", "made-up-model", KEY), "Be brief.", "Hello")
    assert provider[0]["messages"][0]["content"] == "Be brief."


def test_complete_with_claude_reads_the_text_blocks(monkeypatch):
    calls: list[dict] = []

    class Messages:
        def create(self, **kwargs):
            calls.append(kwargs)
            blocks = [
                SimpleNamespace(type="text", text="Hi "),
                SimpleNamespace(type="thinking"),
                SimpleNamespace(type="text", text="there"),
            ]
            return SimpleNamespace(stop_reason="end_turn", content=blocks)

    monkeypatch.setattr(whoop_ai, "_anthropic", lambda api_key: SimpleNamespace(messages=Messages()))
    access = whoop_ai.AiAccess("anthropic", "claude-made-up", KEY, "Write in English")
    assert assistant.complete(access, "Be brief.", "Hello") == "Hi there"
    assert calls[0]["model"] == "claude-made-up"
    assert "Be brief." in calls[0]["system"] and "Write in English" in calls[0]["system"]
    assert calls[0]["messages"] == [{"role": "user", "content": "Hello"}]


def test_complete_with_claude_refusal_or_empty_answer_says_so(monkeypatch):
    answers = [SimpleNamespace(stop_reason="refusal", content=[]), SimpleNamespace(stop_reason="end_turn", content=[])]
    messages = SimpleNamespace(create=lambda **kwargs: answers.pop(0))
    monkeypatch.setattr(whoop_ai, "_anthropic", lambda api_key: SimpleNamespace(messages=messages))
    for _ in range(2):
        with pytest.raises(whoop_ai.InsightUnavailable):
            assistant.complete(whoop_ai.AiAccess("anthropic", "m", KEY), "s", "p")


def test_complete_with_chatgpt_uses_the_users_connection(monkeypatch):
    seen: list[list[dict]] = []

    def respond(db, user, messages, tools=None):
        seen.append(messages)
        return chatgpt_ai.Reply(text="From ChatGPT", tool_calls=[], model="m")

    monkeypatch.setattr(chatgpt_ai, "respond", respond)
    access = whoop_ai.ChatgptAccess(None, user_id=None, instructions="Short")  # type: ignore[arg-type]
    assert assistant.complete(access, "Be brief.", "Hello") == "From ChatGPT"
    assert seen[0][0]["role"] == "system" and "Short" in seen[0][0]["content"]
    assert seen[0][1] == {"role": "user", "content": "Hello"}

    def expired(*args, **kwargs):
        raise chatgpt_auth.ChatgptExpired("Reconnect ChatGPT in Integrations.")

    monkeypatch.setattr(chatgpt_ai, "respond", expired)
    with pytest.raises(whoop_ai.InsightUnavailable, match="Reconnect"):
        assistant.complete(access, "s", "p")


def test_complete_errors_are_safe_and_never_show_the_key(provider):
    with pytest.raises(whoop_ai.AiKeyRejected) as refused:
        assistant.complete(whoop_ai.AiAccess("openai", "m", "secret-wrong-key"), "s", "p")
    assert "secret-wrong-key" not in str(refused.value)


def test_a_chat_answer_without_text_says_so(monkeypatch):
    answer = {"model": "m", "choices": [{"finish_reason": "stop", "message": {"content": None}}]}
    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(lambda request: httpx.Response(200, json=answer)))
    with pytest.raises(whoop_ai.InsightUnavailable):
        assistant.complete(whoop_ai.AiAccess("openai", "m", KEY), "s", "p")


# The words cap


def test_the_brief_is_cut_to_the_word_limit():
    assert assistant_router.limit_words("one two three", 5) == "one two three"
    cut = assistant_router.limit_words(" ".join(f"w{i}" for i in range(100)), 80)
    assert len(cut.split()) == 80 and cut.endswith("…")
    # Arabic has no spaces inside words either; the same count applies.
    assert len(assistant_router.limit_words(" ".join(["كلمة"] * 90), 80).split()) == 80


# What the server tells the AI about the day


def test_context_has_the_open_tasks_due_or_overdue_and_nothing_else(client: TestClient, auth: dict, db: Session):
    sign_up(client, "other@example.com")
    me, other = user_id(db), user_id(db, "other@example.com")
    add(
        db,
        Task(user_id=me, title="Overdue one", due_at=local("2026-11-01"), priority="high"),
        Task(user_id=me, title="Due today late", due_at=local("2026-11-03", 23)),
        Task(user_id=me, title="Due tomorrow", due_at=local("2026-11-04", 1)),
        Task(user_id=me, title="No date"),
        Task(user_id=me, title="Done", status="done", due_at=local("2026-11-03")),
        Task(user_id=other, title="Someone else's", due_at=local("2026-11-03")),
    )
    tasks = assistant_router.brief_context(db, me, TODAY)["tasks"]
    assert {(t["title"], t["overdue"]) for t in tasks} == {("Overdue one", True), ("Due today late", False)}


def test_context_reminders_are_today_only(client: TestClient, auth: dict, db: Session):
    me = user_id(db)
    add(
        db,
        Reminder(user_id=me, title="Call Sam", remind_at=local("2026-11-03", 14)),
        Reminder(user_id=me, title="Yesterday", remind_at=local("2026-11-02", 14)),
        Reminder(user_id=me, title="Tomorrow", remind_at=local("2026-11-04", 14)),
        Reminder(user_id=me, title="Cancelled", remind_at=local("2026-11-03", 15), status="cancelled"),
    )
    assert assistant_router.brief_context(db, me, TODAY)["reminders"] == [{"title": "Call Sam", "at": "14:00"}]


def test_context_bills_due_within_a_week_and_overdue(client: TestClient, auth: dict, db: Session):
    me = user_id(db)
    add(
        db,
        Bill(user_id=me, name="Rent", amount=2000, currency="SAR", due_at=date(2026, 11, 5)),
        Bill(user_id=me, name="Late", amount=50, currency="SAR", due_at=date(2026, 10, 30)),
        Bill(user_id=me, name="Far", amount=10, currency="SAR", due_at=date(2026, 11, 20)),
        Bill(user_id=me, name="Paid", amount=10, currency="SAR", due_at=date(2026, 11, 4), status="paid"),
    )
    bills = assistant_router.brief_context(db, me, TODAY)["bills"]
    # What is coming up first, then what is late.
    assert [(b["name"], b["due"]) for b in bills] == [("Rent", "2026-11-05"), ("Late", "2026-10-30")]


def test_old_overdue_items_never_push_out_todays(client: TestClient, auth: dict, db: Session):
    me = user_id(db)
    add(
        db,
        *[Task(user_id=me, title=f"Stale {n}", due_at=local("2026-10-01") + timedelta(days=n)) for n in range(12)],
        Task(user_id=me, title="Due today", due_at=local("2026-11-03", 17)),
        *[Bill(user_id=me, name=f"Old bill {n}", amount=5, currency="SAR", due_at=date(2026, 9, 1) + timedelta(days=n)) for n in range(12)],
        Bill(user_id=me, name="Due today bill", amount=5, currency="SAR", due_at=date(2026, 11, 3)),
    )
    context = assistant_router.brief_context(db, me, TODAY)
    assert len(context["tasks"]) == 10 and len(context["bills"]) == 10
    assert context["tasks"][0]["title"] == "Due today" and context["bills"][0]["name"] == "Due today bill"
    # After today's, the most recently overdue come first.
    assert [t["title"] for t in context["tasks"][1:3]] == ["Stale 11", "Stale 10"]
    assert [b["name"] for b in context["bills"][1:3]] == ["Old bill 11", "Old bill 10"]


def test_context_budget_states_use_this_months_matching_expenses(client: TestClient, auth: dict, db: Session):
    me = user_id(db)
    add(
        db,
        Budget(user_id=me, month=date(2026, 11, 1), category="food", amount=100, currency="SAR"),
        Budget(user_id=me, month=date(2026, 11, 1), category="transport", amount=100, currency="SAR"),
        Budget(user_id=me, month=date(2026, 11, 1), category="shopping", amount=100, currency="SAR"),
        Budget(user_id=me, month=date(2026, 11, 1), category="health", amount=100, currency="SAR"),
        Budget(user_id=me, month=date(2026, 10, 1), category="home", amount=100, currency="SAR"),
        # 100.50 of 100 is over, 80 is near, 79.99 stays ok, and the rest don't count.
        Expense(user_id=me, merchant="A", amount=100.5, currency="SAR", category="food", spent_at=local("2026-11-02")),
        Expense(
            user_id=me,
            merchant="B",
            amount=80,
            currency="SAR",
            category="transport",
            spent_at=local("2026-11-01", 0) + timedelta(minutes=1),
        ),
        Expense(user_id=me, merchant="C", amount=79.99, currency="SAR", category="shopping", spent_at=local("2026-11-03")),
        Expense(user_id=me, merchant="D", amount=500, currency="USD", category="shopping", spent_at=local("2026-11-03")),
        Expense(user_id=me, merchant="E", amount=500, currency="SAR", category="health", spent_at=local("2026-10-31", 23)),
        Expense(user_id=me, merchant="F", amount=500, currency="SAR", category="home", spent_at=local("2026-11-02")),
    )
    states = {b["category"]: (b["spent"], b["limit"], b["state"]) for b in assistant_router.brief_context(db, me, TODAY)["budgets"]}
    assert states == {
        "food": (100.5, 100.0, "over"),
        "transport": (80.0, 100.0, "near"),
        "shopping": (79.99, 100.0, "ok"),
        "health": (0.0, 100.0, "ok"),
    }


def test_context_has_the_latest_whoop_recovery_and_sleep_only_when_present(client: TestClient, auth: dict, db: Session):
    me = user_id(db)
    empty = assistant_router.brief_context(db, me, TODAY)
    assert empty["recovery"] is None and empty["sleep"] is None
    start = datetime(2026, 11, 3, 2, 0, tzinfo=UTC)
    add(
        db,
        WhoopCycle(user_id=me, whoop_id=1, start=start, end=start + timedelta(hours=20), timezone_offset="+03:00", score_state="SCORED"),
        WhoopRecovery(user_id=me, cycle_id=1, recovery_score=71.0, score_state="SCORED"),
        SleepLog(user_id=me, sleep_date=TODAY, duration_minutes=450, quality=4),
    )
    context = assistant_router.brief_context(db, me, TODAY)
    assert context["recovery"] == {"percent": 71.0, "date": "2026-11-03"}
    assert context["sleep"] == {"hours": 7.5, "date": "2026-11-03"}


def test_context_sleep_falls_back_to_whoop_and_ignores_old_nights(client: TestClient, auth: dict, db: Session):
    me = user_id(db)
    woke = datetime(2026, 11, 3, 3, 0, tzinfo=UTC)
    night = dict(in_bed_milli=8 * 3_600_000, awake_milli=3_600_000, timezone_offset="+03:00", score_state="SCORED")
    add(db, WhoopSleep(user_id=me, whoop_id="a", start=woke - timedelta(hours=8), end=woke, **night))
    assert assistant_router.brief_context(db, me, TODAY)["sleep"] == {"hours": 7.0, "date": "2026-11-03"}
    # Three days later that night is too old to call "last night".
    assert assistant_router.brief_context(db, me, TODAY + timedelta(days=3))["sleep"] is None


# POST /assistant/brief


def test_brief_needs_sign_in_and_a_valid_body(client: TestClient, auth: dict):
    assert client.post("/assistant/brief", json=BODY).status_code == 401
    for body in ({}, {**BODY, "locale": "fr"}, {**BODY, "date": "tomorrow"}, {**BODY, "extra": 1}):
        assert client.post("/assistant/brief", json=body, headers=auth).status_code == 422, body


def test_brief_refuses_a_date_far_from_the_servers_today(client: TestClient, auth: dict, provider):
    # date.min and date.max would overflow the day arithmetic; nothing odd reaches the AI.
    for day in ("0001-01-01", "9999-12-31", "2026-11-06", "2026-10-31"):
        assert client.post("/assistant/brief", json={**BODY, "date": day}, headers=auth).status_code == 422, day
    assert provider == []


def test_brief_accepts_a_day_either_side_of_the_servers_today(client: TestClient, auth: dict, provider):
    connect(client, auth, provider)
    for day in ("2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"):
        assert client.post("/assistant/brief", json={**BODY, "date": day}, headers=auth).status_code == 200, day


def test_brief_without_a_connected_ai_has_its_own_error(client: TestClient, auth: dict, provider):
    response = client.post("/assistant/brief", json=BODY, headers=auth)
    assert response.status_code == 409
    assert "Integrations" in response.json()["detail"]
    assert provider == []


def test_brief_returns_the_ai_text_and_sends_this_users_day_only(client: TestClient, auth: dict, db: Session, provider):
    connect(client, auth, provider, instructions="Call me Sam")
    other = bearer(sign_up(client, "other@example.com"))
    client.post("/tasks", headers=auth, json={"title": "Pay the plumber", "due_at": local("2026-11-03").isoformat()})
    client.post("/tasks", headers=other, json={"title": "Other secret task", "due_at": local("2026-11-03").isoformat()})

    response = client.post("/assistant/brief", json=BODY, headers=auth)
    assert response.status_code == 200, response.text
    assert response.json() == {"text": "Good morning. Two tasks are due."}
    sent = json.dumps(provider[0], ensure_ascii=False)
    assert "Pay the plumber" in sent and "Other secret task" not in sent
    assert "Call me Sam" in provider[0]["messages"][0]["content"]
    assert "2026-11-03" in provider[0]["messages"][1]["content"]
    # Data is data: the system text says so.
    assert "80 words" in provider[0]["messages"][0]["content"]


def test_brief_asks_for_the_requested_language_and_caps_the_words(client: TestClient, auth: dict, provider):
    connect(client, auth, provider)
    provider.reply[0] = " ".join(["كلمة"] * 120)
    response = client.post("/assistant/brief", json={**BODY, "locale": "ar"}, headers=auth)
    assert response.status_code == 200
    assert len(response.json()["text"].split()) == 80
    assert "Arabic" in provider[0]["messages"][1]["content"]

    client.post("/assistant/brief", json=BODY, headers=auth)
    assert "English" in provider[1]["messages"][1]["content"]


def test_brief_maps_provider_trouble_like_the_whoop_insight(client: TestClient, auth: dict, db: Session, provider, monkeypatch):
    connect(client, auth, provider)
    # The saved key stops working at the provider.
    row = db.get(AiConnection, (user_id(db), "openai"))
    row.api_key = encrypt_secret("revoked-key-123")
    db.commit()
    response = client.post("/assistant/brief", json=BODY, headers=auth)
    assert response.status_code == 502
    assert "revoked-key-123" not in response.text

    def unavailable(*args, **kwargs):
        raise whoop_ai.InsightUnavailable("Can't reach the AI provider from the server. Try again later.")

    monkeypatch.setattr(assistant, "complete", unavailable)
    again = client.post("/assistant/brief", json=BODY, headers=auth)
    assert again.status_code == 502 and "Try again later" in again.json()["detail"]
