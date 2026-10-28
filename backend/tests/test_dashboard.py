from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Goal, Habit, Meal
from app.routers.dashboard import LISTS
from tests.conftest import bearer, sign_up


def test_dashboard_has_every_key_the_app_reads(client: TestClient, auth: dict):
    data = client.get("/dashboard", headers=auth).json()
    assert set(data) == {"profile", *(key for key, *_ in LISTS)}
    assert data["profile"]["timezone"] == "Asia/Riyadh"
    assert all(data[key] == [] for key, *_ in LISTS)


def test_dashboard_rows_match_the_app_types(client: TestClient, auth: dict, me: dict, db: Session):
    db.add(
        Meal(user_id=me["user_id"], name="Kabsa", calories=650, protein_g=Decimal("32.5"), logged_at=datetime(2026, 10, 28, 13, tzinfo=UTC))
    )
    db.commit()
    client.post("/tasks", headers=auth, json={"title": "Plan week"})

    data = client.get("/dashboard", headers=auth).json()
    meal = data["meals"][0]
    # Numbers stay JSON numbers, as PostgREST returned them.
    assert meal["protein_g"] == 32.5
    assert meal["carbs_g"] is None
    assert set(data["tasks"][0]) == {
        "id", "user_id", "title", "notes", "status", "priority", "due_at", "reminder_at",
        "reminder_sent_at", "recurrence", "created_at", "updated_at",
    }  # fmt: skip


def test_dashboard_skips_archived_habits_and_goals(client: TestClient, auth: dict, me: dict, db: Session):
    user_id = me["user_id"]
    db.add_all(
        [
            Habit(user_id=user_id, name="Read"),
            Habit(user_id=user_id, name="Old", archived_at=datetime(2026, 1, 1, tzinfo=UTC)),
            Goal(user_id=user_id, title="Run 10k", target_at=date(2027, 1, 1)),
            Goal(user_id=user_id, title="Dropped", status="archived"),
        ]
    )
    db.commit()
    data = client.get("/dashboard", headers=auth).json()
    assert [h["name"] for h in data["habits"]] == ["Read"]
    assert [g["title"] for g in data["goals"]] == ["Run 10k"]
    assert data["goals"][0]["target_at"] == "2027-01-01"


def test_dashboard_is_private(client: TestClient, auth: dict):
    client.post("/tasks", headers=auth, json={"title": "Mine"})
    other = client.get("/dashboard", headers=bearer(sign_up(client, "other@example.com"))).json()
    assert other["tasks"] == []
    assert other["profile"]["id"] != client.get("/profile", headers=auth).json()["id"]


def test_profile_update(client: TestClient, auth: dict):
    updated = client.patch("/profile", headers=auth, json={"daily_calorie_target": 2200, "dashboard_modules": ["tasks", "food"]})
    assert updated.status_code == 200
    assert updated.json()["daily_calorie_target"] == 2200
    assert updated.json()["dashboard_modules"] == ["tasks", "food"]

    assert client.patch("/profile", headers=auth, json={"dashboard_modules": []}).status_code == 422
    assert client.patch("/profile", headers=auth, json={"dashboard_modules": ["cars"]}).status_code == 422
    assert client.patch("/profile", headers=auth, json={"daily_calorie_target": -1}).status_code == 422
    assert client.patch("/profile", headers=auth, json={"timezone": None}).status_code == 422
