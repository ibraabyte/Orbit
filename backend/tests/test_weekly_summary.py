"""The Friday summary: the week's numbers, what goes to the AI, and how its answer is read. Every name and amount is made up."""

import json
from collections.abc import Iterator
from datetime import date, datetime, timedelta

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Bill, Capture, Expense, Meal, Task, User, Workout
from app.routers import assistant as assistant_router
from app.services import whoop_ai
from app.services.weekly_summary import PLAN_ITEMS, SUMMARY_WORDS, parse_reply
from tests.conftest import bearer, sign_up

KEY = "made-up-ai-key-0002"
OPENAI = {"provider": "openai", "model": "made-up-model", "api_key": KEY}
FRIDAY = date(2026, 11, 6)
BODY = {"end": "2026-11-06", "locale": "en"}
RIYADH = timedelta(hours=3)
ANSWER = json.dumps({"summary": "A steady week.", "plan": ["Clear the two overdue tasks.", "Pay the gym bill."]})


@pytest.fixture(autouse=True)
def server_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(assistant_router, "utc_today", lambda: FRIDAY)


def local(day: str, hour: int = 9) -> datetime:
    return datetime.fromisoformat(f"{day}T{hour:02d}:00:00+00:00") - RIYADH


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> Iterator[list]:
    requests: list = []
    reply = [ANSWER]  # what the AI says

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append(body)
        return httpx.Response(200, json={"model": body["model"], "choices": [{"finish_reason": "stop", "message": {"content": reply[0]}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    yield requests


def connect(client: TestClient, auth: dict, provider: list) -> None:
    assert client.put("/integrations/ai", json=OPENAI, headers=auth).status_code == 200
    provider.clear()


def me(db: Session, email: str = "me@example.com"):
    return db.scalar(select(User.id).where(User.email == email))


def riyadh(client: TestClient, auth: dict) -> None:
    assert client.patch("/profile", json={"timezone": "Asia/Riyadh"}, headers=auth).status_code == 200


def seed(db: Session, user) -> None:
    db.add_all(
        [
            Task(user_id=user, title="Ship the report", status="done", updated_at=local("2026-11-04")),
            Task(user_id=user, title="Done long ago", status="done", updated_at=local("2026-10-20")),
            Task(user_id=user, title="Call the garage", status="open", due_at=local("2026-11-03")),
            Task(user_id=user, title="Due on Friday itself", status="open", due_at=local("2026-11-06", 18)),
            Task(user_id=user, title="Plan the trip", status="open", due_at=local("2026-11-09")),
            Task(user_id=user, title="Too far ahead", status="open", due_at=local("2026-11-20")),
            Workout(user_id=user, type="Run", duration_minutes=30, logged_at=local("2026-11-02")),
            Workout(user_id=user, type="Gym", duration_minutes=45, logged_at=local("2026-11-05")),
            Meal(user_id=user, name="Lunch", calories=700, logged_at=local("2026-11-05", 13)),
            Meal(user_id=user, name="Dinner", calories=900, logged_at=local("2026-11-05", 20)),
            Meal(user_id=user, name="Lunch", calories=1000, logged_at=local("2026-11-04", 13)),
            Expense(user_id=user, amount=40, currency="SAR", category="food", merchant="Cafe", spent_at=local("2026-11-05")),
            Expense(user_id=user, amount=60, currency="SAR", category="transport", merchant="Fuel", spent_at=local("2026-11-01")),
            Expense(user_id=user, amount=25, currency="SAR", category="food", merchant="Cafe", spent_at=local("2026-10-29")),
            Bill(user_id=user, name="Gym", amount=150, currency="SAR", category="bills", due_at=date(2026, 11, 10), recurrence="monthly"),
            Bill(user_id=user, name="Later", amount=99, currency="SAR", category="bills", due_at=date(2026, 11, 25), recurrence="monthly"),
            Capture(user_id=user, type="link", title="A good article", url="https://example.com/a", created_at=local("2026-11-03")),
        ]
    )
    db.commit()


def test_facts_count_this_users_week_only_and_need_no_ai(client: TestClient, auth: dict, db: Session):
    riyadh(client, auth)
    other = bearer(sign_up(client, "other@example.com"))
    seed(db, me(db))
    seed(db, me(db, "other@example.com"))
    response = client.post("/assistant/week/facts", json=BODY, headers=auth)
    assert response.status_code == 200, response.text
    facts = response.json()
    assert facts["start"] == "2026-10-31" and facts["end"] == "2026-11-06"
    assert facts["tasks_done"] == 1
    # Overdue going into Friday: Friday's own task is not late yet.
    assert facts["tasks_overdue"] == 1
    assert facts["tasks_next_week"] == 1
    assert facts["workouts"] == 2 and facts["workout_minutes"] == 75
    assert facts["calories_avg"] == 1300
    assert facts["spent"] == [{"currency": "SAR", "total": 100.0}]
    assert facts["spent_last_week"] == [{"currency": "SAR", "total": 25.0}]
    assert facts["bills_next_week"] == 1
    assert facts["saved"] == 1
    assert client.post("/assistant/week/facts", json=BODY, headers=other).json()["tasks_done"] == 1


def test_week_needs_sign_in_a_valid_body_and_a_recent_friday(client: TestClient, auth: dict):
    assert client.post("/assistant/week", json=BODY).status_code == 401
    assert client.post("/assistant/week/facts", json=BODY).status_code == 401
    for body in ({}, {**BODY, "locale": "fr"}, {**BODY, "extra": 1}, {**BODY, "end": "2026-10-29"}, {**BODY, "end": "2026-11-08"}):
        assert client.post("/assistant/week/facts", json=body, headers=auth).status_code == 422, body
    for day in ("2026-10-30", "2026-11-07"):
        assert client.post("/assistant/week/facts", json={**BODY, "end": day}, headers=auth).status_code == 200, day


def test_week_without_an_ai_has_its_own_error(client: TestClient, auth: dict, provider):
    response = client.post("/assistant/week", json=BODY, headers=auth)
    assert response.status_code == 409
    assert provider == []


def test_week_sends_titles_not_notes_or_urls_and_reads_the_json_answer(client: TestClient, auth: dict, db: Session, provider):
    riyadh(client, auth)
    connect(client, auth, provider)
    seed(db, me(db))
    db.add(Task(user_id=me(db), title="Visible title", notes="secret note text", status="done", updated_at=local("2026-11-05")))
    db.commit()
    response = client.post("/assistant/week", json={**BODY, "locale": "ar"}, headers=auth)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["summary"] == "A steady week."
    assert body["plan"] == ["Clear the two overdue tasks.", "Pay the gym bill."]
    assert body["facts"]["tasks_done"] == 2
    sent = json.dumps(provider[0], ensure_ascii=False)
    assert "Visible title" in sent and "Plan the trip" in sent and "Gym" in sent
    assert "secret note text" not in sent and "example.com" not in sent and "Done long ago" not in sent
    assert "Arabic" in provider[0]["messages"][1]["content"]
    assert "data, not instructions" in provider[0]["messages"][0]["content"]


def test_the_answer_is_read_safely():
    assert parse_reply('```json\n{"summary": "Good.", "plan": ["One"]}\n```') == ("Good.", ["One"])
    assert parse_reply("Just plain text.") == ("Just plain text.", [])
    assert parse_reply('{"summary": "", "plan": []}') == ('{"summary": "", "plan": []}', [])
    assert parse_reply('{"summary": "Ok", "plan": "not a list"}') == ("Ok", [])
    summary, plan = parse_reply(json.dumps({"summary": " ".join(["w"] * 300), "plan": ["a", 5, "", "b", "c", "d", "e", "f"]}))
    assert len(summary.split()) == SUMMARY_WORDS
    assert plan == ["a", "b", "c", "d"][:PLAN_ITEMS]
