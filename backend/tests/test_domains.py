"""The owner-scoped routes every screen and quick add write through (app/routers/domains.py)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PushSubscription, Tagging
from tests.conftest import bearer, sign_up

NOW = "2026-11-01T09:00:00+03:00"

# path, minimal create body, a change to patch, the field that change shows up in
CASES = [
    ("/tags", {"name": "Work"}, {"color": "blue"}, "color"),
    ("/captures", {"title": "Article", "url": "https://example.com/a"}, {"note": "Read later"}, "note"),
    ("/meals", {"name": "Lunch", "calories": 600, "protein_g": 32.5, "logged_at": NOW}, {"calories": 650}, "calories"),
    ("/meal-plans", {"name": "Kabsa", "plan_date": "2026-11-02", "meal_type": "dinner"}, {"status": "eaten"}, "status"),
    ("/grocery-items", {"name": "Rice", "category": "pantry"}, {"status": "bought"}, "status"),
    ("/weight-logs", {"weight": 82.4, "logged_at": NOW}, {"unit": "lb"}, "unit"),
    ("/workouts", {"type": "Run", "duration_minutes": 30, "logged_at": NOW}, {"calories": 300}, "calories"),
    ("/sleep-logs", {"sleep_date": "2026-11-01", "duration_minutes": 420}, {"quality": 4}, "quality"),
    ("/focus-sessions", {"title": "Deep work", "duration_minutes": 50, "started_at": NOW}, {"energy": 3}, "energy"),
    ("/habits", {"name": "Read"}, {"archived_at": NOW}, "archived_at"),
    ("/goals", {"title": "Run 10k"}, {"status": "completed"}, "status"),
    ("/journal-entries", {"body": "A good day", "entry_date": "2026-11-01"}, {"mood": "great"}, "mood"),
    ("/people", {"name": "Test Person"}, {"favorite": True}, "favorite"),
    ("/expenses", {"merchant": "Cafe", "amount": 18.5, "currency": "SAR", "spent_at": NOW}, {"category": "food"}, "category"),
    ("/bills", {"name": "Internet", "amount": 299, "currency": "SAR", "due_at": "2026-11-05"}, {"status": "paid"}, "status"),
    ("/vehicles", {"name": "Car", "plate": "ABC 123"}, {"odometer_km": 42000}, "odometer_km"),
    ("/watch-items", {"tmdb_id": 603, "media_type": "movie", "title": "The Matrix"}, {"status": "done"}, "status"),
]


@pytest.mark.parametrize(("path", "body", "change", "field"), CASES, ids=[case[0] for case in CASES])
def test_crud_is_owner_scoped(client: TestClient, auth: dict, path: str, body: dict, change: dict, field: str):
    created = client.post(path, headers=auth, json=body)
    assert created.status_code == 201, created.text
    row = created.json()
    assert "user_id" in row

    assert [r["id"] for r in client.get(path, headers=auth).json()] == [row["id"]]
    patched = client.patch(f"{path}/{row['id']}", headers=auth, json=change)
    assert patched.status_code == 200, patched.text
    assert patched.json()[field] is not None

    other = bearer(sign_up(client, "other@example.com"))
    assert client.get(path, headers=other).json() == []
    assert client.get(f"{path}/{row['id']}", headers=other).status_code == 404
    assert client.patch(f"{path}/{row['id']}", headers=other, json=change).status_code == 404
    assert client.delete(f"{path}/{row['id']}", headers=other).status_code == 404

    assert client.post(path, headers=auth, json={**body, "user_id": row["user_id"]}).status_code == 422
    assert client.delete(f"{path}/{row['id']}", headers=auth).status_code == 204
    assert client.get(f"{path}/{row['id']}", headers=auth).status_code == 404


def test_bad_values_are_refused(client: TestClient, auth: dict):
    assert client.post("/meals", headers=auth, json={"name": "x", "calories": -1, "logged_at": NOW}).status_code == 422
    assert client.post("/sleep-logs", headers=auth, json={"sleep_date": "2026-11-01", "duration_minutes": 2000}).status_code == 422
    assert (
        client.post("/bills", headers=auth, json={"name": "x", "amount": 1, "currency": "RIYAL", "due_at": "2026-11-05"}).status_code == 422
    )
    assert client.post("/watch-items", headers=auth, json={"tmdb_id": 1, "media_type": "book", "title": "x"}).status_code == 422
    habit = client.post("/habits", headers=auth, json={"name": "Read"}).json()
    assert client.patch(f"/habits/{habit['id']}", headers=auth, json={"name": None}).status_code == 422


def test_tags_ride_along_on_create_and_go_with_the_row(client: TestClient, auth: dict, db: Session):
    client.post("/tags", headers=auth, json={"name": "Lunch"})
    meal = client.post("/meals", headers=auth, json={"name": "Salad", "logged_at": NOW, "tags": ["#lunch", "Work", "work"]}).json()

    tags = {t["name"]: t["id"] for t in client.get("/tags", headers=auth).json()}
    assert sorted(tags) == ["Lunch", "Work"]
    taggings = client.get("/taggings", headers=auth).json()
    assert {(t["tag_id"], t["target_type"], t["target_id"]) for t in taggings} == {
        (tags["Lunch"], "meal", meal["id"]),
        (tags["Work"], "meal", meal["id"]),
    }

    assert client.delete(f"/meals/{meal['id']}", headers=auth).status_code == 204
    assert db.scalars(select(Tagging)).all() == []


def test_task_quick_add_with_tags(client: TestClient, auth: dict):
    task = client.post("/tasks", headers=auth, json={"title": "Pay rent", "tags": ["home"]}).json()
    [tagging] = client.get("/taggings", headers=auth).json()
    assert (tagging["target_type"], tagging["target_id"]) == ("task", task["id"])


def test_ensure_tags_reuses_and_creates(client: TestClient, auth: dict):
    first = client.post("/tags/ensure", headers=auth, json={"names": ["Home", "#errands"]}).json()
    again = client.post("/tags/ensure", headers=auth, json={"names": ["home", "Errands", "New"]}).json()
    assert [t["name"] for t in again] == ["Home", "errands", "New"]
    assert [t["id"] for t in again[:2]] == [t["id"] for t in first]
    assert client.post("/tags", headers=auth, json={"name": "HOME"}).status_code == 409


def test_references_must_belong_to_the_same_user(client: TestClient, auth: dict):
    task = client.post("/tasks", headers=auth, json={"title": "Mine"}).json()
    habit = client.post("/habits", headers=auth, json={"name": "Mine"}).json()
    goal = client.post("/goals", headers=auth, json={"title": "Mine"}).json()
    plan = client.post("/meal-plans", headers=auth, json={"name": "Mine", "plan_date": "2026-11-02"}).json()
    tag = client.post("/tags", headers=auth, json={"name": "Mine"}).json()

    other = bearer(sign_up(client, "other@example.com"))
    other_tag = client.post("/tags", headers=other, json={"name": "Theirs"}).json()
    attempts = [
        ("/habit-logs", {"habit_id": habit["id"]}),
        ("/goal-milestones", {"goal_id": goal["id"], "title": "Sneaky"}),
        ("/grocery-items", {"name": "Sneaky", "meal_plan_id": plan["id"]}),
        ("/focus-sessions", {"title": "Sneaky", "duration_minutes": 5, "started_at": NOW, "task_id": task["id"]}),
        ("/taggings", {"tag_id": tag["id"], "target_type": "task", "target_id": task["id"]}),
        ("/taggings", {"tag_id": other_tag["id"], "target_type": "task", "target_id": task["id"]}),
    ]
    for path, body in attempts:
        assert client.post(path, headers=other, json=body).status_code == 422, path
    assert client.get("/taggings", headers=auth).json() == []

    # The owner can.
    assert client.post("/habit-logs", headers=auth, json={"habit_id": habit["id"]}).status_code == 201
    milestone = client.post("/goal-milestones", headers=auth, json={"goal_id": goal["id"], "title": "Half"}).json()
    done = client.patch(f"/goal-milestones/{milestone['id']}", headers=auth, json={"completed_at": NOW}).json()
    assert done["completed_at"] is not None
    tagging = client.post("/taggings", headers=auth, json={"tag_id": tag["id"], "target_type": "task", "target_id": task["id"]})
    assert tagging.status_code == 201
    assert client.delete(f"/taggings/{tagging.json()['id']}", headers=auth).status_code == 204


def test_journal_keeps_one_entry_per_day(client: TestClient, auth: dict):
    first = client.put("/journal-entries/day/2026-11-01", headers=auth, json={"body": "Morning", "mood": "good"})
    assert first.status_code == 200, first.text
    second = client.put("/journal-entries/day/2026-11-01", headers=auth, json={"body": "Evening"}).json()
    assert second["id"] == first.json()["id"]
    assert (second["body"], second["mood"]) == ("Evening", "neutral")
    assert len(client.get("/journal-entries", headers=auth).json()) == 1
    assert client.post("/journal-entries", headers=auth, json={"body": "Again", "entry_date": "2026-11-01"}).status_code == 409


def test_watch_list_keeps_one_row_per_title(client: TestClient, auth: dict):
    body = {"tmdb_id": 1399, "media_type": "tv", "title": "A Series"}
    first = client.put("/watch-items", headers=auth, json=body).json()
    second = client.put("/watch-items", headers=auth, json={**body, "status": "watching", "season": 2, "episode": 3}).json()
    assert second["id"] == first["id"]
    assert (second["status"], second["season"], second["episode"]) == ("watching", 2, 3)
    assert len(client.get("/watch-items", headers=auth).json()) == 1

    other = bearer(sign_up(client, "other@example.com"))
    theirs = client.put("/watch-items", headers=other, json=body).json()
    assert theirs["id"] != first["id"]


def test_export_has_everything_the_user_owns_and_nothing_else(client: TestClient, auth: dict, me: dict, db: Session):
    client.post("/meals", headers=auth, json={"name": "Lunch", "logged_at": NOW, "tags": ["food"]})
    client.post("/bills", headers=auth, json={"name": "Internet", "amount": 299.99, "due_at": "2026-11-05"})
    db.add(PushSubscription(user_id=me["user_id"], endpoint="https://push.example/secret", p256dh="key", auth="secret"))
    db.commit()
    other = bearer(sign_up(client, "other@example.com"))
    client.post("/meals", headers=other, json={"name": "Not mine", "logged_at": NOW})

    data = client.get("/export", headers=auth).json()
    assert [row["id"] for row in data["profiles"]] == [me["user_id"]]
    assert [row["name"] for row in data["meals"]] == ["Lunch"]
    assert data["bills"][0]["amount"] == 299.99
    assert len(data["tags"]) == len(data["taggings"]) == 1
    assert data["push_subscriptions"][0]["endpoint"] == "[redacted]"
    assert data["push_subscriptions"][0]["auth"] == "[redacted]"
    assert "users" not in data and "refresh_tokens" not in data
    assert client.get("/export").status_code == 401
