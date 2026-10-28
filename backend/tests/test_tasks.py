from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Reminder, Tag, Tagging
from tests.conftest import bearer, sign_up


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value)


def test_task_crud(client: TestClient, auth: dict):
    created = client.post("/tasks", headers=auth, json={"title": "Change oil", "priority": "high", "due_at": "2026-11-01T09:00:00+03:00"})
    assert created.status_code == 201
    task = created.json()
    assert task["status"] == "open"
    assert task["recurrence"] is None
    assert parse(task["due_at"]) == datetime(2026, 11, 1, 6, tzinfo=UTC)

    assert client.get(f"/tasks/{task['id']}", headers=auth).json()["title"] == "Change oil"

    updated = client.patch(f"/tasks/{task['id']}", headers=auth, json={"notes": "5W-30", "due_at": None}).json()
    assert updated["notes"] == "5W-30"
    assert updated["due_at"] is None
    assert updated["priority"] == "high"
    assert parse(updated["updated_at"]) >= parse(task["updated_at"])

    assert [t["id"] for t in client.get("/tasks", headers=auth).json()] == [task["id"]]
    assert client.delete(f"/tasks/{task['id']}", headers=auth).status_code == 204
    assert client.get(f"/tasks/{task['id']}", headers=auth).status_code == 404


def test_task_list_is_newest_first_and_pages(client: TestClient, auth: dict):
    ids = [client.post("/tasks", headers=auth, json={"title": f"Task {n}"}).json()["id"] for n in range(3)]
    assert [t["id"] for t in client.get("/tasks", headers=auth).json()] == ids[::-1]
    assert [t["id"] for t in client.get("/tasks?limit=1&offset=1", headers=auth).json()] == [ids[1]]


def test_task_input_is_validated(client: TestClient, auth: dict):
    assert client.post("/tasks", headers=auth, json={"title": ""}).status_code == 422
    assert client.post("/tasks", headers=auth, json={"title": "x" * 221}).status_code == 422
    assert client.post("/tasks", headers=auth, json={"title": "ok", "priority": "urgent"}).status_code == 422
    assert client.post("/tasks", headers=auth, json={"title": "ok", "user_id": "00000000-0000-0000-0000-000000000000"}).status_code == 422

    task = client.post("/tasks", headers=auth, json={"title": "ok"}).json()
    assert client.patch(f"/tasks/{task['id']}", headers=auth, json={"title": None}).status_code == 422
    assert client.patch(f"/tasks/{task['id']}", headers=auth, json={"status": None}).status_code == 422


def test_users_only_see_their_own_tasks(client: TestClient, auth: dict):
    mine = client.post("/tasks", headers=auth, json={"title": "Mine"}).json()
    other = bearer(sign_up(client, "other@example.com"))

    assert client.get("/tasks", headers=other).json() == []
    assert client.get(f"/tasks/{mine['id']}", headers=other).status_code == 404
    assert client.patch(f"/tasks/{mine['id']}", headers=other, json={"title": "Taken"}).status_code == 404
    assert client.delete(f"/tasks/{mine['id']}", headers=other).status_code == 404
    assert client.post(f"/tasks/{mine['id']}/complete", headers=other).status_code == 404
    assert client.get(f"/tasks/{mine['id']}", headers=auth).json()["title"] == "Mine"


def test_reminder_cannot_point_at_someone_elses_task(client: TestClient, auth: dict):
    mine = client.post("/tasks", headers=auth, json={"title": "Mine"}).json()
    other = bearer(sign_up(client, "other@example.com"))
    response = client.post(
        "/reminders", headers=other, json={"task_id": mine["id"], "title": "Sneaky", "remind_at": "2026-11-01T09:00:00Z"}
    )
    assert response.status_code == 422


def test_task_with_reminder_schedules_it(client: TestClient, auth: dict):
    task = client.post(
        "/tasks", headers=auth, json={"title": "Call the bank", "notes": "Card", "reminder_at": "2026-11-02T08:00:00Z"}
    ).json()
    reminders = client.get("/reminders", headers=auth).json()
    assert len(reminders) == 1
    assert reminders[0]["task_id"] == task["id"]
    assert reminders[0]["body"] == "Card"
    assert reminders[0]["status"] == "scheduled"

    # Deleting the task takes its reminders with it.
    client.delete(f"/tasks/{task['id']}", headers=auth)
    assert client.get("/reminders", headers=auth).json() == []


def test_completing_a_one_off_task(client: TestClient, auth: dict):
    task = client.post("/tasks", headers=auth, json={"title": "Pay fine", "reminder_at": "2026-11-02T08:00:00Z"}).json()
    result = client.post(f"/tasks/{task['id']}/complete", headers=auth).json()

    assert result["task"]["status"] == "done"
    assert result["next_task"] is None
    assert [r["status"] for r in client.get("/reminders", headers=auth).json()] == ["cancelled"]


def test_completing_a_repeating_task_creates_the_next_one(client: TestClient, auth: dict, me: dict, db: Session):
    due = datetime.now(UTC).replace(microsecond=0) - timedelta(days=2, hours=1)
    task = client.post(
        "/tasks",
        headers=auth,
        json={
            "title": "Water plants",
            "priority": "low",
            "recurrence": "daily",
            "due_at": due.isoformat(),
            "reminder_at": (due - timedelta(minutes=30)).isoformat(),
        },
    ).json()
    tag = Tag(user_id=me["user_id"], name="home")
    db.add(tag)
    db.flush()
    db.add(Tagging(user_id=me["user_id"], tag_id=tag.id, target_type="task", target_id=task["id"]))
    db.commit()

    result = client.post(f"/tasks/{task['id']}/complete", headers=auth).json()
    following = result["next_task"]

    # Overdue by two days, so it skips to the first repeat after now, keeping the 30 minute lead.
    assert parse(following["due_at"]) == due + timedelta(days=3)
    assert parse(following["reminder_at"]) == due + timedelta(days=3, minutes=-30)
    assert following["status"] == "open"
    assert following["priority"] == "low"
    assert following["recurrence"] == "daily"

    reminders = {r["task_id"]: r["status"] for r in client.get("/reminders", headers=auth).json()}
    assert reminders == {task["id"]: "cancelled", following["id"]: "scheduled"}
    copied = db.scalars(select(Tagging.tag_id).where(Tagging.target_id == following["id"])).all()
    assert copied == [tag.id]


def test_completing_twice_does_not_duplicate(client: TestClient, auth: dict, db: Session):
    task = client.post("/tasks", headers=auth, json={"title": "Gym", "recurrence": "weekly", "due_at": "2030-01-01T18:00:00Z"}).json()
    first = client.post(f"/tasks/{task['id']}/complete", headers=auth).json()
    second = client.post(f"/tasks/{task['id']}/complete", headers=auth).json()

    assert parse(first["next_task"]["due_at"]) == datetime(2030, 1, 8, 18, tzinfo=UTC)
    assert second["next_task"] is None
    assert len(client.get("/tasks", headers=auth).json()) == 2
    assert db.scalars(select(Reminder)).all() == []
