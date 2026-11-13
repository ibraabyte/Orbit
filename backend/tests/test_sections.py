"""Sections switched off in Settings: stored on the profile, and left out of what the AI sees and can change. A hidden
section's rows are never touched. Every name and number here is made up."""

import json
from datetime import date, datetime

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Bill, Expense, Habit, Meal
from app.routers import assistant as assistant_router
from app.services import sections
from tests.test_ask import ASK, add, connect, local, provider, server_clock, user_id  # noqa: F401  (fixtures)
from tests.test_assistant_act import act, call, ready, script, tool_results  # noqa: F401  (fixtures)


def hide(client: TestClient, auth: dict, *names: str) -> dict:
    response = client.patch("/profile", headers=auth, json={"hidden_sections": list(names)})
    assert response.status_code == 200, response.text
    return response.json()


def test_everything_shows_until_something_is_switched_off(client: TestClient, auth: dict):
    assert client.get("/profile", headers=auth).json()["hidden_sections"] == []
    assert client.get("/dashboard", headers=auth).json()["profile"]["hidden_sections"] == []


def test_hidden_sections_are_stored_once_each_in_a_fixed_order_and_shared_by_every_device(client: TestClient, auth: dict):
    assert hide(client, auth, "finance", "food", "finance")["hidden_sections"] == ["food", "finance"]
    # The dashboard bundle carries it, so the phone and the iPad read the same choice.
    assert client.get("/dashboard", headers=auth).json()["profile"]["hidden_sections"] == ["food", "finance"]
    assert hide(client, auth)["hidden_sections"] == []
    # Unknown names, tasks (always on) and nulls are refused.
    for bad in (["tasks"], ["cars"], None, [1]):
        assert client.patch("/profile", headers=auth, json={"hidden_sections": bad}).status_code == 422, bad


def test_hiding_never_touches_the_sections_data(client: TestClient, auth: dict, db: Session):
    add(db, Expense(user_id=user_id(db), merchant="Cafe Noor", amount=40, currency="SAR", category="food", spent_at=local("2026-11-02")))
    hide(client, auth, "finance")
    assert db.scalar(select(func.count()).select_from(Expense)) == 1
    hide(client, auth)
    assert [e["merchant"] for e in client.get("/dashboard", headers=auth).json()["expenses"]] == ["Cafe Noor"]


def test_health_switched_off_hides_what_lives_inside_it():
    assert sections.expand(["health"]) == {"health", "food", "exercises", "whoop", "medications"}
    assert sections.expand(["food", "nonsense"]) == {"food"}
    assert sections.kind_on("task", sections.expand(["health", "finance", "habits", "library"]))
    assert not sections.kind_on("meal", sections.expand(["health"]))


def test_drop_hidden_removes_the_parts_and_their_counts():
    data = {
        "tasks": [1],
        "bills": [2],
        "budgets": [],
        "habits": [3],
        "counts": {"tasks": 1, "bills": 1},
        "covers": {"no_date_window": {"bills": "x", "tasks": "y"}},
    }
    out = sections.drop_hidden(data, sections.expand(["finance"]))
    assert out == {"tasks": [1], "habits": [3], "counts": {"tasks": 1}, "covers": {"no_date_window": {"tasks": "y"}}}
    assert sections.drop_hidden(data, frozenset()) is data


def test_ask_leaves_out_a_hidden_section(client: TestClient, auth: dict, db: Session, provider):  # noqa: F811
    connect(client, auth, provider)
    me = user_id(db)
    add(
        db,
        Expense(user_id=me, merchant="Cafe Noor", amount=40, currency="SAR", category="food", spent_at=local("2026-11-02")),
        Habit(user_id=me, name="Read pages"),
    )
    hide(client, auth, "finance")
    assert client.post("/assistant/ask", json=ASK, headers=auth).status_code == 200
    prompt = provider[0]["messages"][1]["content"]
    assert "Cafe Noor" not in prompt and '"expenses"' not in prompt and '"bills"' not in prompt
    assert "Read pages" in prompt


def test_the_brief_leaves_out_hidden_bills(client: TestClient, auth: dict, db: Session, provider, monkeypatch):  # noqa: F811
    monkeypatch.setattr(assistant_router, "utc_today", lambda: date(2026, 11, 3))
    connect(client, auth, provider)
    add(db, Bill(user_id=user_id(db), name="Gym plan", amount=99, currency="SAR", category="health", due_at=date(2026, 11, 4)))
    hide(client, auth, "finance")
    assert client.post("/assistant/brief", json={"date": "2026-11-03", "locale": "en"}, headers=auth).status_code == 200
    assert "Gym plan" not in provider[0]["messages"][1]["content"]


def test_the_assistant_neither_sees_nor_changes_a_hidden_section(client: TestClient, ready: dict, db: Session, script):  # noqa: F811
    me = user_id(db)
    add(db, Meal(user_id=me, name="Made-up oats", calories=300, logged_at=datetime(2026, 11, 2, 6)))
    hide(client, ready, "health")
    script.append({"content": None, "tool_calls": [call("propose_create", kind="meal", fields={"name": "Rice", "calories": 400})]})
    script.append({"content": "Food is switched off."})
    response = act(client, ready, "أكلت رز 400")
    assert response.status_code == 200, response.text
    assert response.json()["actions"] == []
    first = script.seen[0]
    assert "Made-up oats" not in first["messages"][-1]["content"]
    kinds = first["tools"][1]["function"]["parameters"]["properties"]["kind"]["enum"]
    assert "task" in kinds and "expense" in kinds and not {"meal", "food", "grocery", "workout", "sleep", "weight"} & set(kinds)
    assert "switched off" in tool_results(script.seen[1])[0]["error"]


def test_the_weekly_summary_leaves_out_hidden_numbers(client: TestClient, auth: dict, db: Session, monkeypatch):
    monkeypatch.setattr(assistant_router, "utc_today", lambda: date(2026, 11, 6))
    add(db, Expense(user_id=user_id(db), merchant="Cafe Noor", amount=40, currency="SAR", category="food", spent_at=local("2026-11-04")))
    body = {"end": "2026-11-06", "locale": "en"}
    assert client.post("/assistant/week/facts", json=body, headers=auth).json()["spent"] != []
    hide(client, auth, "finance")
    facts = client.post("/assistant/week/facts", json=body, headers=auth).json()
    assert facts["spent"] == [] and facts["bills_next_week"] == 0 and facts["tasks_done"] == 0
    hide(client, auth, "health")
    facts = client.post("/assistant/week/facts", json=body, headers=auth).json()
    assert facts["calories_avg"] is None and facts["workout_target"] is None and facts["workouts"] == 0 and facts["spent"] != []
    hide(client, auth, "finance")
    _, context = assistant_router._week(db, user_id(db), date(2026, 11, 6))
    assert "top_spending" not in context and context["facts"]["spent"] == [] and "Cafe Noor" not in json.dumps(context)
