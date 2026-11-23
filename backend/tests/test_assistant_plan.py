# ruff: noqa: F811  (the fixtures come from test_assistant_act)
"""The assistant and the workout plan, medicines, documents and the rest: the AI proposes, the app applies the confirmed
changes to the routes (PUT /plan, POST /plan/exercises, ...). Every name, key and value here is made up."""

import json
from datetime import date, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Medication, PlannedExercise, PlannedWorkout, TrainingPlan
from tests.conftest import bearer, sign_up
from tests.test_assistant_act import OPENAI, Script, act, call, me, ready, script, tool_results  # noqa: F401
from tests.test_plan import FULL_GYM, every_day, gym, set_plan, today, week


def prompt_items(script: Script) -> dict:
    content = script.seen[0]["messages"][1]["content"]
    start = content.index("{")
    data, _ = json.JSONDecoder().raw_decode(content[start:])
    return data["items"]


def test_a_new_workout_plan_is_proposed_then_saved_by_the_plan_route(client: TestClient, ready: dict, db: Session, script: Script):
    script.append({"tool_calls": [call("propose_set_workout_plan", goal="muscle", weekdays=[6, 0, 2, 3])]})
    script.append({"content": "جهزت لك جدول تمارين أربعة أيام، أكده."})
    body = act(client, ready, "سو لي جدول تمارين ٤ أيام أبي أضخم: الأحد والاثنين والأربعاء والخميس").json()
    [action] = body["actions"]
    assert action == {
        "op": "create",
        "kind": "workout_plan",
        "id": None,
        "label": "Workout plan",
        "fields": {"goal": "muscle", "level": "intermediate", "weekdays": [0, 2, 3, 6]},
    }
    assert db.scalar(select(func.count()).select_from(TrainingPlan)) == 0
    saved = client.put("/plan", json=action["fields"], headers=ready)
    assert saved.status_code == 200, saved.text
    assert saved.json()["weekdays"] == [0, 2, 3, 6]


def test_a_new_plan_with_no_goal_goes_back_to_the_ai(client: TestClient, ready: dict, script: Script):
    script.append({"tool_calls": [call("propose_set_workout_plan", weekdays=[0, 2])]})
    script.append({"content": "وش هدفك من التمرين؟"})
    body = act(client, ready, "أبي أتمرن يومين").json()
    assert body["actions"] == []
    assert "goal" in tool_results(script.seen[1])[0]["error"]


def test_changing_the_plan_keeps_what_was_not_said(client: TestClient, ready: dict, script: Script):
    set_plan(client, ready, goal="strength", level="advanced", weekdays=[0, 2, 4])
    script.append({"tool_calls": [call("propose_set_workout_plan", weekdays=[1, 3])]})
    body = act(client, ready, "خل التمرين الثلاثاء والخميس بس").json()
    [action] = body["actions"]
    assert action["op"] == "update" and action["fields"] == {"goal": "strength", "level": "advanced", "weekdays": [1, 3]}
    items = prompt_items(script)
    assert items["workout_plan"]["days"] == ["Monday", "Wednesday", "Friday"]


def test_stopping_the_plan_is_a_delete_the_user_confirms(client: TestClient, ready: dict, db: Session, script: Script):
    script.append({"tool_calls": [call("propose_stop_workout_plan")]})
    act(client, ready, "وقف جدول التمارين")
    assert "no workout plan" in tool_results(script.seen[1])[0]["error"]
    set_plan(client, ready)
    script.append({"tool_calls": [call("propose_stop_workout_plan")]})
    [action] = act(client, ready, "وقف جدول التمارين").json()["actions"]
    assert action["op"] == "delete" and action["kind"] == "workout_plan"
    assert db.get(TrainingPlan, me(db)) is not None
    assert client.delete("/plan", headers=ready).status_code == 204


def test_a_coming_day_is_edited_by_ref(client: TestClient, ready: dict, db: Session, script: Script):
    gym(client, ready, FULL_GYM)
    set_plan(client, ready, weekdays=every_day())
    days = week(client, ready)["days"]
    script.append({"tool_calls": [call("find_items", kind="exercise", text="dumbbell bench press")]})
    script.append(
        {
            "tool_calls": [
                call(
                    "propose_update",
                    kind="planned_exercise",
                    ref="planned_exercise-1",
                    fields={"exercise_id": "Dumbbell_Bench_Press", "sets": 5},
                ),
                call("propose_delete", kind="planned_exercise", ref="planned_exercise-2"),
                call("propose_create", kind="planned_exercise", fields={"planned_workout_id": "planned_day-2", "exercise_id": "Pushups"}),
                call("propose_move_workout_day", ref="planned_day-1"),
            ]
        }
    )
    body = act(client, ready, "بدل البنش بالدمبل وخله ٥ جولات، شيل التمرين الثاني، زيد ضغط بكرة، واليوم ما بروح").json()
    prompt = script.seen[0]["messages"][1]["content"]
    # The AI sees refs, never the plan's ids.
    assert days[0]["id"] not in prompt and days[0]["exercises"][0]["id"] not in prompt
    found = tool_results(script.seen[1])[0]["items"]
    assert found[0]["exercise_id"] == "Dumbbell_Bench_Press" and found[0]["fits_my_gym"] is True
    update, delete, create, move = body["actions"]
    first, second = days[0]["exercises"][:2]
    assert (
        update["op"] == "update" and update["id"] == first["id"] and update["fields"] == {"exercise_id": "Dumbbell_Bench_Press", "sets": 5}
    )
    assert delete["op"] == "delete" and delete["id"] == second["id"]
    assert create["fields"]["planned_workout_id"] == days[1]["id"] and create["label"].startswith("Pushups")
    assert move == {
        "op": "move",
        "kind": "planned_day",
        "id": days[0]["id"],
        "label": f"{days[0]['kind']} · {days[0]['date']}",
        "fields": {},
    }
    # Nothing changed until the app sends the confirmed ones.
    assert db.get(PlannedExercise, first["id"]).sets == first["base_sets"]

    changed = client.patch(f"/plan/exercises/{update['id']}", json=update["fields"], headers=ready)
    assert changed.status_code == 200, changed.text
    entry = changed.json()["exercises"][0]
    assert entry["exercise_id"] == "Dumbbell_Bench_Press" and entry["base_sets"] == 5 and entry["swapped_from"] == first["exercise_id"]
    assert client.delete(f"/plan/exercises/{delete['id']}", headers=ready).status_code == 204
    added = client.post("/plan/exercises", json=create["fields"], headers=ready)
    assert added.status_code == 201, added.text
    assert added.json()["exercises"][-1]["exercise_id"] == "Pushups" and added.json()["exercises"][-1]["sets"] == 3
    assert client.post(f"/plan/days/{move['id']}/move", headers=ready).status_code == 200


def test_a_made_up_exercise_or_a_plan_day_delete_is_refused(client: TestClient, ready: dict, script: Script):
    gym(client, ready, FULL_GYM)
    set_plan(client, ready)
    script.append(
        {
            "tool_calls": [
                call("propose_update", kind="planned_exercise", ref="planned_exercise-1", fields={"exercise_id": "Made_Up_Lift"}),
                call("propose_delete", kind="planned_day", ref="planned_day-1"),
                call("propose_create", kind="planned_day", fields={"plan_date": "2026-12-01"}),
            ]
        }
    )
    body = act(client, ready, "غير التمرين").json()
    assert body["actions"] == []
    errors = [result["error"] for result in tool_results(script.seen[1])]
    assert "library" in errors[0] and "can't be deleted" in errors[1] and "can't be made" in errors[2]


def test_hidden_exercises_keep_the_plan_away_from_the_ai(client: TestClient, ready: dict, script: Script):
    set_plan(client, ready)
    assert client.patch("/profile", headers=ready, json={"hidden_sections": ["exercises"]}).status_code == 200
    script.append({"tool_calls": [call("propose_set_workout_plan", goal="fitness")]})
    act(client, ready, "غير هدفي")
    assert "workout_plan" not in prompt_items(script)
    names = {tool["function"]["name"] for tool in script.seen[0]["tools"]}
    assert "propose_set_workout_plan" not in names
    assert "switched off" in tool_results(script.seen[1])[0]["error"]


def test_medicines_documents_and_injuries_are_proposed_for_their_routes(client: TestClient, ready: dict, db: Session, script: Script):
    expires = (date.today() + timedelta(days=200)).isoformat()
    script.append(
        {
            "tool_calls": [
                call("propose_create", kind="medication", fields={"name": "Vitamin D", "dose": "1 tab", "times": ["09:00"]}),
                call("propose_create", kind="document", fields={"kind": "passport", "expires_on": expires}),
                call("propose_create", kind="injury", fields={"area": "knee"}),
                call("propose_create", kind="body_measurement", fields={"kind": "waist", "value": 82, "unit": "cm"}),
            ]
        }
    )
    body = act(client, ready, "ضيف فيتامين د الساعة ٩، جوازي ينتهي، ركبتي تعورني، خصري ٨٢").json()
    medicine, document, injury, measurement = body["actions"]
    assert db.scalar(select(func.count()).select_from(Medication)) == 0
    assert document["label"] == "passport" and measurement["fields"]["measured_at"].endswith("+03:00")
    for action, path in ((medicine, "/medications"), (document, "/documents"), (injury, "/injuries"), (measurement, "/body-measurements")):
        saved = client.post(path, json=action["fields"], headers=ready)
        assert saved.status_code == 201, (path, saved.text)


def test_the_plan_routes_only_change_coming_days_of_ones_own_plan(client: TestClient, ready: dict, db: Session):
    gym(client, ready, FULL_GYM)
    set_plan(client, ready)
    days = week(client, ready)["days"]
    entry = days[0]["exercises"][0]
    bad = client.patch(f"/plan/exercises/{entry['id']}", json={"reps_low": 12, "reps_high": 8}, headers=ready)
    assert bad.status_code == 422
    assert (
        client.post("/plan/exercises", json={"planned_workout_id": days[0]["id"], "exercise_id": "Made_Up"}, headers=ready).status_code
        == 422
    )

    other = bearer(sign_up(client, "other@example.com"))
    assert client.patch(f"/plan/exercises/{entry['id']}", json={"sets": 2}, headers=other).status_code == 404
    assert client.delete(f"/plan/exercises/{entry['id']}", headers=other).status_code == 404
    assert (
        client.post("/plan/exercises", json={"planned_workout_id": days[0]["id"], "exercise_id": "Pushups"}, headers=other).status_code
        == 404
    )

    # Once a day is started, it is changed in the workout instead.
    assert client.post(f"/plan/days/{days[0]['id']}/start", headers=ready).status_code == 201
    assert client.patch(f"/plan/exercises/{entry['id']}", json={"sets": 2}, headers=ready).status_code == 409
    assert client.delete(f"/plan/exercises/{entry['id']}", headers=ready).status_code == 409
    # A past day can't be changed either.
    db.get(PlannedWorkout, days[1]["id"]).plan_date = today() - timedelta(days=1)
    db.commit()
    assert (
        client.post("/plan/exercises", json={"planned_workout_id": days[1]["id"], "exercise_id": "Pushups"}, headers=ready).status_code
        == 409
    )
