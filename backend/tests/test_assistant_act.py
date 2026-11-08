"""The assistant (POST /assistant/act): the user's AI proposes changes with tools; nothing is saved until the app sends the
confirmed ones to the item routers.

Providers are fakes that answer from a script; every key and name here is made up.
"""

import json
import uuid
from collections.abc import Iterator
from types import SimpleNamespace

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Expense, Meal, Profile, Task, User
from app.services import whoop_ai
from tests.conftest import bearer, sign_up

KEY = "made-up-ai-key-0001"
OPENAI = {"provider": "openai", "model": "made-up-model", "api_key": KEY}


def call(name: str, **arguments) -> dict:
    return {"id": f"call-{uuid.uuid4().hex[:6]}", "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}


class Script(list):
    """What the fake provider answers, in order; the requests it got are kept in .seen."""

    seen: list[dict]


@pytest.fixture
def script(monkeypatch: pytest.MonkeyPatch) -> Iterator[Script]:
    answers = Script()
    answers.seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["messages"][-1]["content"] == "Reply with OK.":  # the key check when connecting
            return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})
        answers.seen.append(body)
        message = answers.pop(0) if answers else {"content": "Done."}
        return httpx.Response(200, json={"model": body["model"], "choices": [{"message": message}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    yield answers


def me(db: Session, email: str = "me@example.com"):
    return db.scalar(select(User.id).where(User.email == email))


@pytest.fixture
def ready(client: TestClient, auth: dict, db: Session, script) -> dict:
    assert client.put("/integrations/ai", json=OPENAI, headers=auth).status_code == 200
    db.get(Profile, me(db)).timezone = "Asia/Riyadh"
    db.commit()
    return auth


def act(client: TestClient, auth: dict, text: str, **extra):
    return client.post("/assistant/act", json={"text": text, "history": [], "locale": "ar", **extra}, headers=auth)


def tool_results(body: dict) -> list[dict]:
    return [json.loads(m["content"]) for m in body["messages"] if m["role"] == "tool"]


def test_a_quick_expense_is_proposed_not_saved(client: TestClient, ready: dict, db: Session, script: Script):
    script.append(
        {
            "content": None,
            "tool_calls": [call("propose_create", kind="expense", fields={"merchant": "غداء", "amount": 45, "category": "food"})],
        }
    )
    script.append({"content": "جهزت مصروف غداء 45 ريال، أكده."})
    response = act(client, ready, "غداء 45")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["reply"].startswith("جهزت")
    [action] = body["actions"]
    assert action["op"] == "create" and action["kind"] == "expense" and action["id"] is None and action["label"] == "غداء"
    # Currency and time are filled in the user's own way: their usual currency and their local clock.
    assert action["fields"]["currency"] == "SAR"
    assert action["fields"]["spent_at"].endswith("+03:00")
    assert db.scalar(select(func.count()).select_from(Expense)) == 0
    assert tool_results(script.seen[1])[0]["ok"] is True

    # The confirmed change goes to the expense router exactly as proposed.
    saved = client.post("/expenses", json=action["fields"], headers=ready)
    assert saved.status_code == 201, saved.text
    assert saved.json()["merchant"] == "غداء"


def test_items_go_by_ref_and_never_with_ids_or_notes(client: TestClient, ready: dict, db: Session, script: Script):
    task = Task(user_id=me(db), title="Call the plumber", notes="secret door code 4512")
    db.add(task)
    db.commit()
    script.append({"tool_calls": [call("propose_update", kind="task", ref="task-1", fields={"due_at": "2026-11-06T09:00"})]})
    body = act(client, ready, "خل مهمة السباك بكرة").json()
    sent = json.dumps(script.seen[0], ensure_ascii=False)
    prompt = script.seen[0]["messages"][1]["content"]
    assert '"title":"Call the plumber"' in prompt and '"ref":"task-1"' in prompt
    assert str(task.id) not in sent and "4512" not in sent
    [action] = body["actions"]
    assert action == {
        "op": "update",
        "kind": "task",
        "id": str(task.id),
        "label": "Call the plumber",
        "fields": {"due_at": "2026-11-06T09:00:00+03:00"},
    }
    db.refresh(task)
    assert task.due_at is None


def test_a_bad_proposal_goes_back_to_the_ai_to_fix(client: TestClient, ready: dict, script: Script):
    script.append({"tool_calls": [call("propose_create", kind="reminder", fields={"title": "Pay rent"})]})
    script.append({"tool_calls": [call("propose_create", kind="reminder", fields={"title": "Pay rent", "remind_at": "2026-11-07T20:00"})]})
    body = act(client, ready, "ذكرني ادفع الإيجار الجمعة 8 بالليل").json()
    assert "remind_at" in tool_results(script.seen[1])[0]["error"]
    [action] = body["actions"]
    assert action["fields"] == {"title": "Pay rent", "remind_at": "2026-11-07T20:00:00+03:00"}


def test_another_users_items_and_made_up_refs_are_refused(client: TestClient, ready: dict, db: Session, script: Script):
    other = bearer(sign_up(client, email="other@example.com"))
    client.post("/tasks", json={"title": "Their private task"}, headers=other)
    script.append({"tool_calls": [call("find_items", kind="task", text="private"), call("propose_delete", kind="task", ref="task-7")]})
    body = act(client, ready, "احذف المهمة الخاصة").json()
    found, refused = tool_results(script.seen[1])
    assert found == {"items": []}
    assert "Unknown ref" in refused["error"]
    assert body["actions"] == []
    assert "Their private task" not in json.dumps(script.seen, ensure_ascii=False)


def test_marking_a_task_done_completes_it(client: TestClient, ready: dict, db: Session, script: Script):
    db.add(Task(user_id=me(db), title="Renew passport"))
    db.commit()
    script.append({"tool_calls": [call("propose_update", kind="task", ref="task-1", fields={"status": "done"})]})
    [action] = act(client, ready, "خلصت الجواز").json()["actions"]
    assert action["op"] == "complete" and action["fields"] == {}


def test_hidden_fields_and_unknown_kinds_are_refused(client: TestClient, ready: dict, script: Script):
    script.append(
        {
            "tool_calls": [
                call("propose_create", kind="task", fields={"title": "x", "reminder_sent_at": "2026-11-06T09:00"}),
                call("propose_create", kind="journal", fields={"body": "x"}),
                call("propose_create", kind="task", fields={"title": "x", "owner": "someone"}),
            ]
        }
    )
    body = act(client, ready, "x").json()
    errors = [result["error"] for result in tool_results(script.seen[1])]
    assert "can't be set" in errors[0] and "kind must be one of" in errors[1] and "Not valid" in errors[2]
    assert body["actions"] == []


def test_a_mark_habit_done_points_at_the_habit(client: TestClient, ready: dict, script: Script):
    habit = client.post("/habits", json={"name": "Read 10 pages"}, headers=ready).json()
    script.append({"tool_calls": [call("propose_create", kind="habit_log", fields={"habit_id": "habit-1"})]})
    [action] = act(client, ready, "قريت اليوم").json()["actions"]
    assert action["fields"]["habit_id"] == habit["id"] and action["label"] == "Read 10 pages"
    assert client.post("/habit-logs", json=action["fields"], headers=ready).status_code == 201


def test_no_ai_means_connect_first(client: TestClient, auth: dict):
    assert act(client, auth, "غداء 45").status_code == 409


def test_claude_runs_the_same_tools(client: TestClient, auth: dict, monkeypatch):
    requests: list[dict] = []

    class Messages:
        def create(self, **kwargs):
            requests.append(kwargs)
            if kwargs["messages"][-1]["content"] == "Reply with OK.":
                return SimpleNamespace(stop_reason="end_turn", content=[], model=kwargs["model"])
            if len(requests) == 2:
                use = SimpleNamespace(
                    type="tool_use", id="toolu_1", name="propose_create", input={"kind": "grocery", "fields": {"name": "حليب"}}
                )
                return SimpleNamespace(stop_reason="tool_use", content=[use])
            return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="أضفت حليب لقائمة المشتريات، أكده.")])

    monkeypatch.setattr(whoop_ai, "_anthropic", lambda api_key: SimpleNamespace(messages=Messages()))
    assert client.put("/integrations/ai", json={"provider": "anthropic", "api_key": KEY}, headers=auth).status_code == 200
    body = act(client, auth, "اشتري حليب").json()
    assert body["actions"][0]["kind"] == "grocery" and body["actions"][0]["fields"] == {"name": "حليب"}
    assert {tool["name"] for tool in requests[1]["tools"]} >= {"propose_create", "find_items"}
    result = requests[2]["messages"][-1]["content"][0]
    assert result["type"] == "tool_result" and result["tool_use_id"] == "toolu_1"


def test_a_task_goes_in_a_list_with_its_checklist(client: TestClient, ready: dict, script: Script):
    work = client.post("/task-lists", json={"name": "Work"}, headers=ready).json()
    script.append(
        {
            "tool_calls": [
                call(
                    "propose_create",
                    kind="task",
                    fields={"title": "Send report", "list_id": "task_list-1", "steps": ["Draft", "Check numbers"]},
                ),
                call("propose_create", kind="task", fields={"title": "Fix tap", "list_name": "Home"}),
            ]
        }
    )
    body = act(client, ready, "add send report to work with draft and check numbers, and fix tap at home").json()
    # The AI sees the user's lists by ref, never their ids.
    prompt = script.seen[0]["messages"][1]["content"]
    assert '"ref":"task_list-1","name":"Work"' in prompt and work["id"] not in json.dumps(script.seen[0])
    first, second = body["actions"]
    assert first["fields"]["list_id"] == work["id"] and first["fields"]["steps"] == ["Draft", "Check numbers"]
    assert second["fields"]["list_name"] == "Home"

    # Each confirmed change goes through the task route as it is.
    made = client.post("/tasks", json=first["fields"], headers=ready).json()
    assert made["list_id"] == work["id"]
    assert [s["title"] for s in client.get("/task-steps", headers=ready).json()] == ["Draft", "Check numbers"]
    assert client.post("/tasks", json=second["fields"], headers=ready).status_code == 201
    assert [row["name"] for row in client.get("/task-lists", headers=ready).json()] == ["Work", "Home"]


def test_eating_something_is_logged_by_text_with_no_photo(client: TestClient, ready: dict, db: Session, script: Script):
    kabsa = client.post(
        "/foods", json={"name": "Home kabsa", "serving_label": "1 plate", "calories": 650, "protein_g": 32, "carbs_g": 80.5, "fat_g": 21},
        headers=ready,
    ).json()
    script.append(
        {
            "tool_calls": [
                # A saved food: the AI's own calorie guess is ignored and the food's numbers are used.
                call("propose_create", kind="meal", fields={"food_id": "food-1", "servings": 1.5, "calories": 99, "meal_type": "lunch"}),
                # Not saved: the AI's estimate, with the portion in the name.
                call(
                    "propose_create",
                    kind="meal",
                    fields={"name": "Pepsi · 1 can", "calories": 150, "carbs_g": 41, "protein_g": 0, "fat_g": 0, "meal_type": "lunch"},
                ),
            ]
        }
    )
    script.append({"content": "جهزت الكبسة والبيبسي، أكدهم."})
    body = act(client, ready, "أكلت كبسة البيت صحن ونص وبيبسي").json()
    # The AI sees the saved food by ref with its numbers, never its id; and it is told how to log food.
    prompt = script.seen[0]["messages"][1]["content"]
    assert '"ref":"food-1","name":"Home kabsa"' in prompt and kabsa["id"] not in json.dumps(script.seen[0])
    assert "no photo" in script.seen[0]["messages"][0]["content"]
    saved, drink = body["actions"]
    assert saved["label"] == "Home kabsa"
    assert saved["fields"]["food_id"] == kabsa["id"] and saved["fields"]["servings"] == 1.5
    assert saved["fields"]["calories"] == 975 and saved["fields"]["carbs_g"] == 120.8 and saved["fields"]["protein_g"] == 48
    assert saved["fields"]["logged_at"].endswith("+03:00")
    assert drink["label"] == "Pepsi · 1 can" and drink["fields"]["calories"] == 150 and "food_id" not in drink["fields"]
    assert db.scalar(select(func.count()).select_from(Meal)) == 0

    # The app logs the saved food through its own route and the estimate as a plain meal.
    logged = client.post(f"/foods/{kabsa['id']}/log", json={k: saved["fields"][k] for k in ("servings", "meal_type", "logged_at")}, headers=ready)
    assert logged.status_code == 201 and logged.json()["calories"] == 975
    assert client.post("/meals", json=drink["fields"], headers=ready).status_code == 201


def test_a_food_that_isnt_the_users_or_a_bad_serving_goes_back_to_the_ai(client: TestClient, ready: dict, script: Script):
    other = bearer(sign_up(client, email="other@example.com"))
    client.post("/foods", json={"name": "Their dates", "calories": 20}, headers=other)
    client.post("/foods", json={"name": "Dates", "calories": 23}, headers=ready)
    script.append(
        {
            "tool_calls": [
                call("find_items", kind="food", text="dates"),
                call("propose_create", kind="meal", fields={"food_id": "food-1", "servings": 0}),
                call("propose_create", kind="meal", fields={"food_id": "food-1", "servings": "lots"}),
                call("propose_create", kind="meal", fields={"food_id": "food-9"}),
            ]
        }
    )
    body = act(client, ready, "أكلت تمر").json()
    found, zero, words, unknown = tool_results(script.seen[1])
    assert [item["name"] for item in found["items"]] == ["Dates"]
    assert "servings" in zero["error"] and "servings" in words["error"] and "Unknown ref" in unknown["error"]
    assert body["actions"] == []
    assert "Their dates" not in json.dumps(script.seen, ensure_ascii=False)
