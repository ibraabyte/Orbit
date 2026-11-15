"""The morning day plan: the rules plan, what goes to the AI, and how its answer is checked. Every title is made up."""

import json
from collections.abc import Iterator
from datetime import date, datetime, time, timedelta, timezone

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.routers import assistant as assistant_router
from app.services import whoop_ai
from tests.conftest import bearer, sign_up

DAY = date(2026, 11, 6)
RIYADH = timezone(timedelta(hours=3))
OPENAI = {"provider": "openai", "model": "made-up-model", "api_key": "made-up-ai-key-0003"}
PRAYERS = [
    {"name": "fajr", "at": "04:50"},
    {"name": "dhuhr", "at": "11:40"},
    {"name": "asr", "at": "14:50"},
    {"name": "maghrib", "at": "17:10"},
    {"name": "isha", "at": "18:40"},
]
BODY = {"date": DAY.isoformat(), "locale": "en", "now": "07:05", "prayers": PRAYERS}


@pytest.fixture(autouse=True)
def server_clock(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(assistant_router, "utc_today", lambda: DAY)


@pytest.fixture
def provider(monkeypatch: pytest.MonkeyPatch) -> Iterator[list]:
    requests: list = []
    reply = [json.dumps({"note": "A good day.", "blocks": []})]

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append(body)
        return httpx.Response(200, json={"model": body["model"], "choices": [{"finish_reason": "stop", "message": {"content": reply[0]}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    requests.append(reply)  # requests[0] is the reply box; the rest are the calls
    yield requests


def say(provider: list, value) -> None:
    provider[0][0] = value if isinstance(value, str) else json.dumps(value)


def calls(provider: list) -> list:
    return provider[1:]


def at(hour: int, minute: int = 0, day: date = DAY) -> datetime:
    return datetime.combine(day, time(hour, minute), RIYADH)


def me(db: Session, email: str = "me@example.com"):
    return db.scalar(select(m.User.id).where(m.User.email == email))


def riyadh(client: TestClient, auth: dict) -> None:
    assert client.patch("/profile", json={"timezone": "Asia/Riyadh"}, headers=auth).status_code == 200


def recovery(db: Session, score: float, day: date = DAY) -> None:
    user = me(db)
    db.add(m.WhoopCycle(user_id=user, whoop_id=1, score_state="SCORED", start=at(5, 0, day), timezone_offset="+03:00", strain=8.0))
    db.add(m.WhoopRecovery(user_id=user, cycle_id=1, score_state="SCORED", recovery_score=score))
    db.commit()


def tasks(db: Session, user, *rows: tuple[str, str, datetime, datetime | None]) -> None:
    db.add_all(
        [m.Task(user_id=user, title=title, priority=priority, due_at=due, reminder_at=remind) for title, priority, due, remind in rows]
    )
    db.commit()


def plan(client: TestClient, auth: dict, path: str = "/assistant/day/draft", **body) -> dict:
    response = client.post(path, json={**BODY, **body}, headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def kinds(reply: dict) -> list[tuple[str, str, str]]:
    return [(b["start"], b["kind"], b["prayer"] or b["title"] or b["workout_kind"] or "") for b in reply["blocks"]]


def test_needs_sign_in_and_a_valid_body(client: TestClient, auth: dict):
    assert client.post("/assistant/day/draft", json=BODY).status_code == 401
    assert client.post("/assistant/day", json=BODY).status_code == 401
    for body in (
        {**BODY, "now": "25:00"},
        {**BODY, "now": "7:05"},
        {**BODY, "prayers": [{"name": "duha", "at": "08:00"}]},
        {**BODY, "prayers": [{"name": "fajr", "at": "4:50"}]},
        {**BODY, "prayers": PRAYERS * 2},
        {**BODY, "date": "2026-11-20"},
        {**BODY, "extra": 1},
    ):
        assert client.post("/assistant/day/draft", json=body, headers=auth).status_code == 422, body


def test_rules_plan_keeps_prayers_and_set_times_and_fills_the_gaps(client: TestClient, auth: dict, db: Session):
    riyadh(client, auth)
    user = me(db)
    tasks(
        db,
        user,
        ("Write the report", "high", at(17, 0), None),
        ("Dentist", "normal", at(10, 0), at(9, 45)),
        ("Water the plants", "low", at(0, 0), None),
        ("Old thing", "normal", at(9, 0, DAY - timedelta(days=2)), None),
        ("Next week", "normal", at(9, 0, DAY + timedelta(days=7)), None),
    )
    db.add(m.Reminder(user_id=user, title="Call the bank", remind_at=at(13, 0), status="scheduled"))
    db.commit()
    other = bearer(sign_up(client, "other@example.com"))
    reply = plan(client, auth)
    assert reply["source"] == "rules" and reply["note"] is None and reply["start"] == "07:15"
    assert reply["energy"] is None and reply["left_out"] == 0
    # Fajr has passed; the rest are fixed, as are the reminder and the task with a reminder (an appointment).
    assert kinds(reply) == [
        ("07:15", "task", "Write the report"),
        ("08:15", "task", "Old thing"),
        ("09:00", "task", "Water the plants"),
        ("10:00", "appointment", "Dentist"),
        ("11:40", "prayer", "dhuhr"),
        ("13:00", "reminder", "Call the bank"),
        ("14:50", "prayer", "asr"),
        ("17:10", "prayer", "maghrib"),
        ("18:40", "prayer", "isha"),
    ]
    blocks = reply["blocks"]
    assert all(a["end"] <= b["start"] for a, b in zip(blocks, blocks[1:], strict=False))
    assert blocks[0]["task_id"] and blocks[0]["priority"] == "high"
    # Someone else sees only their own day.
    assert [b["kind"] for b in plan(client, other)["blocks"]] == ["prayer"] * 4


def test_low_energy_keeps_the_day_light(client: TestClient, auth: dict, db: Session):
    riyadh(client, auth)
    recovery(db, 25)
    tasks(db, me(db), *[(f"Task {n}", "high", at(20, 0), None) for n in range(5)])
    reply = plan(client, auth)
    assert reply["energy"]["level"] == "low" and reply["energy"]["recovery"] == 25
    work = [b for b in reply["blocks"] if b["kind"] == "task"]
    assert len(work) == 2 and reply["left_out"] == 3
    assert [b["kind"] for b in reply["blocks"]][:4] == ["task", "break", "task", "break"]


def test_high_energy_takes_more_and_whoop_off_is_ignored(client: TestClient, auth: dict, db: Session):
    riyadh(client, auth)
    recovery(db, 90)
    tasks(db, me(db), *[(f"Task {n}", "normal", at(22, 0), None) for n in range(7)])
    reply = plan(client, auth)
    assert reply["energy"]["level"] == "high" and reply["left_out"] == 1
    assert client.patch("/profile", headers=auth, json={"hidden_sections": ["whoop"]}).status_code == 200
    reply = plan(client, auth)
    assert reply["energy"] is None and reply["left_out"] == 3


def test_planned_workout_goes_late_afternoon_or_rest_on_red(client: TestClient, auth: dict, db: Session):
    riyadh(client, auth)
    response = client.put("/plan", headers=auth, json={"goal": "muscle", "level": "beginner", "weekdays": [0, 1, 2, 3, 4, 5, 6]})
    assert response.status_code == 200, response.text
    assert client.get("/plan/week", headers=auth).status_code == 200
    planned = db.scalar(select(m.PlannedWorkout).where(m.PlannedWorkout.plan_date == DAY))
    if planned is None:  # the plan is laid out from the real today; put one on DAY
        db.add(m.PlannedWorkout(user_id=me(db), plan_date=DAY, kind="full_a", rotation=0))
        db.commit()
    workout = [b for b in plan(client, auth)["blocks"] if b["kind"] == "workout"]
    assert len(workout) == 1 and workout[0]["start"] >= "16:00" and workout[0]["workout_kind"]
    recovery(db, 20)
    reply = plan(client, auth)
    assert reply["rest_day"] is True and not [b for b in reply["blocks"] if b["kind"] == "workout"]


def test_ai_plan_is_checked_and_titles_come_from_the_database(client: TestClient, auth: dict, db: Session, provider):
    riyadh(client, auth)
    tasks(db, me(db), ("Write the report", "high", at(17, 0), None), ("Read a chapter", "low", at(0, 0), None))
    assert client.put("/integrations/ai", json=OPENAI, headers=auth).status_code == 200
    say(
        provider,
        {
            "note": "Recovery is fine; start with the report.",
            "blocks": [
                {"start": "08:00", "end": "09:00", "kind": "task", "ref": "t1", "title": "IGNORE ME"},
                {"start": "09:00", "end": "09:15", "kind": "break", "title": "Coffee"},
                {"start": "11:30", "end": "12:00", "kind": "task", "ref": "t2"},  # runs into dhuhr: dropped
                {"start": "10:00", "end": "10:30", "kind": "task", "ref": "t9"},  # no such task: dropped
                {"start": "10:00", "end": "10:30", "kind": "task", "ref": "t1"},  # already placed: dropped
                {"start": "06:00", "end": "06:30", "kind": "break"},  # before now: dropped
                {"start": "10:00", "end": "10:30", "kind": "prayer"},  # not the AI's to add: dropped
                "nonsense",
            ],
        },
    )
    reply = plan(client, auth, "/assistant/day", locale="ar")
    assert reply["source"] == "ai" and reply["note"] == "Recovery is fine; start with the report."
    assert kinds(reply)[:2] == [("08:00", "task", "Write the report"), ("09:00", "break", "Coffee")]
    assert reply["left_out"] == 1
    sent = calls(provider)[-1]
    prompt = sent["messages"][-1]["content"]
    assert "Arabic" in prompt and "Write the report" in prompt and '"ref":"t1"' in prompt
    # No ids or notes go out.
    assert reply["blocks"][0]["task_id"] not in prompt


def test_unusable_ai_answer_falls_back_to_rules(client: TestClient, auth: dict, db: Session, provider):
    riyadh(client, auth)
    tasks(db, me(db), ("Write the report", "high", at(17, 0), None))
    assert client.put("/integrations/ai", json=OPENAI, headers=auth).status_code == 200
    for answer in ("not json at all", {"blocks": "nope"}, {"blocks": [{"start": "11:45", "end": "12:00", "kind": "task", "ref": "t1"}]}):
        say(provider, answer)
        reply = plan(client, auth, "/assistant/day")
        assert reply["source"] == "rules" and reply["blocks"][0]["title"] == "Write the report", answer


def test_ai_day_without_an_ai_has_its_own_error(client: TestClient, auth: dict):
    assert client.post("/assistant/day", json=BODY, headers=auth).status_code == 409
