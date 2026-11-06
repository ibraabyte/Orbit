"""Lists (Home, Work), checklists inside a task, and reminders that follow a snoozed or edited task."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from tests.conftest import bearer, sign_up


@pytest.fixture
def auth(me: dict) -> dict[str, str]:
    return bearer(me)


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value)


def test_lists_crud_and_one_name_per_user(client: TestClient, auth: dict):
    home = client.post("/task-lists", headers=auth, json={"name": "Home"})
    assert home.status_code == 201
    work = client.post("/task-lists", headers=auth, json={"name": "Work", "position": 1}).json()
    assert [row["name"] for row in client.get("/task-lists", headers=auth).json()] == ["Home", "Work"]

    # Same name in another case is the same list.
    assert client.post("/task-lists", headers=auth, json={"name": "home"}).status_code == 409
    assert client.post("/task-lists", headers=auth, json={"name": ""}).status_code == 422
    assert client.post("/task-lists", headers=auth, json={"name": "x" * 61}).status_code == 422

    renamed = client.patch(f"/task-lists/{work['id']}", headers=auth, json={"name": "Office"}).json()
    assert renamed["name"] == "Office"


def test_deleting_a_list_keeps_its_tasks(client: TestClient, auth: dict):
    work = client.post("/task-lists", headers=auth, json={"name": "Work"}).json()
    task = client.post("/tasks", headers=auth, json={"title": "Send report", "list_id": work["id"]}).json()
    assert task["list_id"] == work["id"]

    assert client.delete(f"/task-lists/{work['id']}", headers=auth).status_code == 204
    kept = client.get(f"/tasks/{task['id']}", headers=auth).json()
    assert kept["title"] == "Send report"
    assert kept["list_id"] is None


def test_list_by_name_is_found_or_made(client: TestClient, auth: dict):
    home = client.post("/task-lists", headers=auth, json={"name": "Home"}).json()
    first = client.post("/tasks", headers=auth, json={"title": "Fix tap", "list_name": "home"}).json()
    assert first["list_id"] == home["id"]

    second = client.post("/tasks", headers=auth, json={"title": "Call client", "list_name": " Work "}).json()
    lists = client.get("/task-lists", headers=auth).json()
    assert [(row["name"], row["position"]) for row in lists] == [("Home", 0), ("Work", 1)]
    assert second["list_id"] == lists[1]["id"]

    # Moving a task by name, and clearing its list by id.
    moved = client.patch(f"/tasks/{first['id']}", headers=auth, json={"list_name": "Work"}).json()
    assert moved["list_id"] == lists[1]["id"]
    cleared = client.patch(f"/tasks/{first['id']}", headers=auth, json={"list_id": None}).json()
    assert cleared["list_id"] is None

    both = {"title": "x", "list_id": home["id"], "list_name": "Home"}
    assert client.post("/tasks", headers=auth, json=both).status_code == 422


def test_a_task_cannot_go_in_someone_elses_list(client: TestClient, auth: dict):
    other = bearer(sign_up(client, "other@example.com"))
    theirs = client.post("/task-lists", headers=other, json={"name": "Private"}).json()

    assert client.post("/tasks", headers=auth, json={"title": "x", "list_id": theirs["id"]}).status_code == 422
    mine = client.post("/tasks", headers=auth, json={"title": "x"}).json()
    assert client.patch(f"/tasks/{mine['id']}", headers=auth, json={"list_id": theirs["id"]}).status_code == 422
    assert client.get("/task-lists", headers=auth).json() == []
    assert client.patch(f"/task-lists/{theirs['id']}", headers=auth, json={"name": "Taken"}).status_code == 404


def test_steps_are_made_with_the_task_and_edited_alone(client: TestClient, auth: dict):
    task = client.post("/tasks", headers=auth, json={"title": "Pack for trip", "steps": ["Passport", " Charger ", "Tickets"]}).json()
    steps = client.get("/task-steps", headers=auth).json()
    assert [(s["title"], s["position"], s["done"]) for s in steps] == [("Passport", 0, False), ("Charger", 1, False), ("Tickets", 2, False)]
    assert {s["task_id"] for s in steps} == {task["id"]}

    ticked = client.patch(f"/task-steps/{steps[0]['id']}", headers=auth, json={"done": True}).json()
    assert ticked["done"] is True
    added = client.post("/task-steps", headers=auth, json={"task_id": task["id"], "title": "Snacks", "position": 3})
    assert added.status_code == 201
    assert client.delete(f"/task-steps/{steps[1]['id']}", headers=auth).status_code == 204
    assert [s["title"] for s in client.get("/task-steps", headers=auth).json()] == ["Passport", "Tickets", "Snacks"]

    assert client.post("/tasks", headers=auth, json={"title": "x", "steps": [""]}).status_code == 422
    assert client.post("/tasks", headers=auth, json={"title": "x", "steps": ["a"] * 31}).status_code == 422

    # Deleting the task takes its checklist with it.
    client.delete(f"/tasks/{task['id']}", headers=auth)
    assert client.get("/task-steps", headers=auth).json() == []


def test_steps_only_on_your_own_tasks(client: TestClient, auth: dict):
    other = bearer(sign_up(client, "other@example.com"))
    theirs = client.post("/tasks", headers=other, json={"title": "Theirs", "steps": ["Secret"]}).json()

    assert client.post("/task-steps", headers=auth, json={"task_id": theirs["id"], "title": "Sneak"}).status_code == 422
    assert client.get("/task-steps", headers=auth).json() == []
    step = client.get("/task-steps", headers=other).json()[0]
    assert client.patch(f"/task-steps/{step['id']}", headers=auth, json={"done": True}).status_code == 404


def test_a_repeating_task_comes_back_with_its_list_and_a_fresh_checklist(client: TestClient, auth: dict):
    task = client.post(
        "/tasks",
        headers=auth,
        json={
            "title": "Weekly review",
            "recurrence": "weekly",
            "due_at": "2030-01-01T18:00:00Z",
            "list_name": "Work",
            "steps": ["Inbox", "Calendar"],
        },
    ).json()
    first = client.get("/task-steps", headers=auth).json()[0]
    client.patch(f"/task-steps/{first['id']}", headers=auth, json={"done": True})

    following = client.post(f"/tasks/{task['id']}/complete", headers=auth).json()["next_task"]
    assert following["list_id"] == task["list_id"]
    fresh = [(s["title"], s["done"]) for s in client.get("/task-steps", headers=auth).json() if s["task_id"] == following["id"]]
    assert fresh == [("Inbox", False), ("Calendar", False)]


def test_snoozing_moves_the_reminder(client: TestClient, auth: dict):
    due = datetime(2030, 3, 1, 9, tzinfo=UTC)
    task = client.post(
        "/tasks",
        headers=auth,
        json={"title": "Call bank", "due_at": due.isoformat(), "reminder_at": (due - timedelta(minutes=15)).isoformat()},
    ).json()
    client.patch(f"/tasks/{task['id']}", headers=auth, json={"reminder_sent_at": "2030-03-01T08:45:00Z"})

    later = due + timedelta(days=1)
    snoozed = client.patch(
        f"/tasks/{task['id']}", headers=auth, json={"due_at": later.isoformat(), "reminder_at": (later - timedelta(minutes=15)).isoformat()}
    ).json()
    assert parse(snoozed["due_at"]) == later
    # The phone may notify again for the new time.
    assert snoozed["reminder_sent_at"] is None

    reminders = sorted(client.get("/reminders", headers=auth).json(), key=lambda r: r["remind_at"])
    assert [(r["status"], parse(r["remind_at"])) for r in reminders] == [
        ("cancelled", due - timedelta(minutes=15)),
        ("scheduled", later - timedelta(minutes=15)),
    ]

    # Clearing the reminder cancels it and schedules nothing.
    client.patch(f"/tasks/{task['id']}", headers=auth, json={"reminder_at": None})
    assert [r["status"] for r in client.get("/reminders", headers=auth).json()] == ["cancelled", "cancelled"]

    # Editing other fields leaves reminders alone.
    plain = client.post("/tasks", headers=auth, json={"title": "Plain", "reminder_at": "2030-03-02T08:00:00Z"}).json()
    client.patch(f"/tasks/{plain['id']}", headers=auth, json={"title": "Plainer", "priority": "high"})
    statuses = [r["status"] for r in client.get("/reminders", headers=auth).json() if r["task_id"] == plain["id"]]
    assert statuses == ["scheduled"]


def test_dashboard_carries_lists_and_open_checklists(client: TestClient, auth: dict):
    open_task = client.post("/tasks", headers=auth, json={"title": "Open", "list_name": "Home", "steps": ["One"]}).json()
    done_task = client.post("/tasks", headers=auth, json={"title": "Done", "steps": ["Old"]}).json()
    client.post(f"/tasks/{done_task['id']}/complete", headers=auth)

    data = client.get("/dashboard", headers=auth).json()
    assert [row["name"] for row in data["taskLists"]] == ["Home"]
    assert [s["title"] for s in data["taskSteps"]] == ["One"]
    # Open tasks come first, whatever order they were made in.
    assert data["tasks"][0]["id"] == open_task["id"]


def test_dashboard_keeps_open_tasks_when_many_are_done(client: TestClient, auth: dict, me: dict, db):
    from app.models import Task

    db.add_all(Task(user_id=me["user_id"], title=f"Done {n}", status="done") for n in range(320))
    db.add(Task(user_id=me["user_id"], title="Still open", created_at=datetime(2020, 1, 1, tzinfo=UTC)))
    db.commit()
    tasks = client.get("/dashboard", headers=auth).json()["tasks"]
    assert tasks[0]["title"] == "Still open"
