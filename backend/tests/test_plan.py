"""The automatic workout plan: laying out the week, recovery, moving a day, and swapping an exercise."""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from tests.conftest import bearer, sign_up

RIYADH = ZoneInfo("Asia/Riyadh")
FULL_GYM = ["barbell", "dumbbell", "cable", "machine", "e-z curl bar"]


def today() -> date:
    return datetime.now(RIYADH).date()


def every_day() -> list[int]:
    return [0, 1, 2, 3, 4, 5, 6]


def set_plan(client: TestClient, auth: dict, **body) -> dict:
    body = {"goal": "muscle", "level": "intermediate", "weekdays": every_day(), **body}
    response = client.put("/plan", headers=auth, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def week(client: TestClient, auth: dict) -> dict:
    response = client.get("/plan/week", headers=auth)
    assert response.status_code == 200, response.text
    return response.json()


def gym(client: TestClient, auth: dict, equipment: list[str]) -> None:
    assert client.put("/gym/equipment", headers=auth, json={"equipment": equipment}).status_code == 200


def recovery(db: Session, score: float, day: date | None = None) -> None:
    user_id = db.scalar(select(m.User.id))
    start = datetime.combine(day or today(), time(6, 0), tzinfo=timezone(timedelta(hours=3)))
    db.add(m.WhoopCycle(user_id=user_id, whoop_id=1, score_state="SCORED", start=start, timezone_offset="+03:00", strain=8.0))
    db.add(m.WhoopRecovery(user_id=user_id, cycle_id=1, score_state="SCORED", recovery_score=score))
    db.commit()


def ids(day: dict) -> list[str]:
    return [entry["exercise_id"] for entry in day["exercises"]]


def test_needs_sign_in(client: TestClient):
    for path in ("/plan", "/plan/week"):
        assert client.get(path).status_code == 401


def test_no_plan_yet(client: TestClient, auth: dict):
    assert client.get("/plan", headers=auth).json() is None
    data = week(client, auth)
    assert data["plan"] is None and data["days"] == []


def test_a_week_laid_out_on_the_chosen_days(client: TestClient, auth: dict):
    gym(client, auth, FULL_GYM)
    start = today()
    chosen = sorted({start.weekday(), (start + timedelta(days=2)).weekday(), (start + timedelta(days=4)).weekday()})
    assert set_plan(client, auth, weekdays=chosen)["weekdays"] == chosen

    data = week(client, auth)
    assert data["gym_empty"] is False
    assert [day["date"] for day in data["days"]] == [(start + timedelta(days=n)).isoformat() for n in (0, 2, 4)]
    # Three days, an intermediate: push, pull, legs, in that order.
    assert [day["kind"] for day in data["days"]] == ["push", "pull", "legs"]
    push, pull, legs = data["days"]
    assert ids(push)[0] == "Barbell_Bench_Press_-_Medium_Grip" and "Wide-Grip_Lat_Pulldown" in ids(pull) and ids(legs)[0] == "Barbell_Squat"
    first = push["exercises"][0]
    # Building muscle: 4 × 6-10 on a big lift, 2 minutes' rest.
    assert (first["sets"], first["reps_low"], first["reps_high"], first["rest_seconds"]) == (4, 6, 10, 120)
    assert first["image_url"].startswith("https://") and push["status"] == "planned"
    # Reading it again lays out nothing new.
    assert [day["id"] for day in week(client, auth)["days"]] == [day["id"] for day in data["days"]]


def test_an_empty_gym_gets_bodyweight_exercises(client: TestClient, auth: dict):
    start = today()
    set_plan(client, auth, level="beginner", goal="fitness", weekdays=sorted({(start + timedelta(days=n)).weekday() for n in (0, 2, 4)}))
    data = week(client, auth)
    assert data["gym_empty"] is True
    # Three days, a beginner: full body A and B in turn.
    assert [day["kind"] for day in data["days"][:3]] == ["full_a", "full_b", "full_a"]
    for day in data["days"]:
        assert all(entry["equipment"] in (None, "body only") for entry in day["exercises"])
    assert "Pushups" in ids(data["days"][0]) and "Bodyweight_Squat" in ids(data["days"][0])


def test_an_injury_leaves_its_muscles_out(client: TestClient, auth: dict):
    gym(client, auth, FULL_GYM)
    assert client.post("/injuries", headers=auth, json={"area": "knee"}).status_code == 201
    set_plan(client, auth)
    legs = next(day for day in week(client, auth)["days"] if day["kind"] == "legs")
    assert {entry["muscle"] for entry in legs["exercises"]}.isdisjoint({"quadriceps", "hamstrings"})
    assert legs["exercises"], "calves and core still fit"


def test_low_recovery_lightens_today(client: TestClient, auth: dict, db: Session):
    gym(client, auth, FULL_GYM)
    set_plan(client, auth)
    recovery(db, 22)
    data = week(client, auth)
    assert data["recovery"] == {"score": 22, "adjustment": "rest"}
    first, second = data["days"][0], data["days"][1]
    assert first["adjustment"] == "rest" and first["recovery_score"] == 22
    # One set fewer each, and the sixth exercise left out.
    assert len(first["exercises"]) == 6 and len(first["dropped"]) == 1
    assert [entry["sets"] for entry in first["exercises"][:5]] == [entry["base_sets"] - 1 for entry in first["exercises"][:5]]
    # Only today changes.
    assert second["adjustment"] == "none" and second["dropped"] == []


def test_high_recovery_adds_a_set(client: TestClient, auth: dict, db: Session):
    gym(client, auth, FULL_GYM)
    set_plan(client, auth)
    recovery(db, 91)
    day = week(client, auth)["days"][0]
    assert day["adjustment"] == "push"
    assert [entry["sets"] - entry["base_sets"] for entry in day["exercises"]][:3] == [1, 1, 0]


def test_no_recovery_today_changes_nothing(client: TestClient, auth: dict, db: Session):
    set_plan(client, auth)
    recovery(db, 20, today() - timedelta(days=1))
    data = week(client, auth)
    assert data["recovery"] == {"score": None, "adjustment": "none"}
    assert data["days"][0]["dropped"] == []


def test_whoop_switched_off_is_not_used(client: TestClient, auth: dict, db: Session):
    set_plan(client, auth)
    recovery(db, 20)
    assert client.patch("/profile", headers=auth, json={"hidden_sections": ["whoop"]}).status_code == 200
    assert week(client, auth)["recovery"]["score"] is None


def test_starting_a_day_makes_a_ready_session(client: TestClient, auth: dict, db: Session):
    gym(client, auth, FULL_GYM)
    set_plan(client, auth)
    recovery(db, 50)
    day = week(client, auth)["days"][0]
    response = client.post(f"/plan/days/{day['id']}/start", headers=auth, json={"type": "Push day"})
    assert response.status_code == 201, response.text
    session = response.json()
    assert session["type"] == "Push day" and session["in_progress"] is True
    kept = [entry for entry in day["exercises"] if entry["id"] not in day["dropped"]]
    assert [entry["exercise_id"] for entry in session["exercises"]] == [entry["exercise_id"] for entry in kept]
    assert [len(entry["sets"]) for entry in session["exercises"]] == [entry["sets"] for entry in kept]
    assert session["exercises"][0]["rest_seconds"] == 120
    # A first time: the low end of the rep range, no weight yet.
    assert {(row["reps"], row["weight"]) for row in session["exercises"][0]["sets"]} == {(6, None)}

    again = client.post(f"/plan/days/{day['id']}/start", headers=auth)
    assert again.json()["id"] == session["id"]
    today_row = week(client, auth)["days"][0]
    assert today_row["status"] == "started" and today_row["workout_id"] == session["id"] and today_row["adjustment"] == "light"

    assert client.post(f"/training/sessions/{session['id']}/finish", headers=auth, json={}).status_code == 200
    assert week(client, auth)["days"][0]["status"] == "done"
    # A started day can't move.
    assert client.post(f"/plan/days/{day['id']}/move", headers=auth).status_code == 409


def test_not_going_today_moves_it_to_tomorrow(client: TestClient, auth: dict):
    start = today()
    # Today and the day after tomorrow: tomorrow is free, so only today's moves.
    set_plan(client, auth, weekdays=sorted({start.weekday(), (start + timedelta(days=2)).weekday()}))
    first, second = week(client, auth)["days"][:2]
    response = client.post(f"/plan/days/{first['id']}/move", headers=auth)
    assert response.status_code == 200 and response.json() == {"date": (start + timedelta(days=1)).isoformat()}
    moved = {day["id"]: day["date"] for day in week(client, auth)["days"]}
    assert moved[first["id"]] == (start + timedelta(days=1)).isoformat()
    assert moved[second["id"]] == second["date"]


def test_moving_shifts_the_days_after_it(client: TestClient, auth: dict):
    start = today()
    set_plan(client, auth)
    days = week(client, auth)["days"]
    assert len(days) == 7
    client.post(f"/plan/days/{days[0]['id']}/move", headers=auth)
    after = week(client, auth)["days"]
    # Today is now a rest day; the same order carries on from tomorrow, and the last one moved past this week.
    assert after[0]["date"] == (start + timedelta(days=1)).isoformat()
    assert [day["id"] for day in after] == [day["id"] for day in days[:6]]
    moved_out = client.get(f"/plan/days/{days[6]['id']}", headers=auth).json()
    assert moved_out["date"] == (start + timedelta(days=7)).isoformat()


def test_moving_steps_over_a_started_day(client: TestClient, auth: dict, db: Session):
    start = today()
    set_plan(client, auth, weekdays=sorted({start.weekday(), (start + timedelta(days=1)).weekday()}))
    first, second = week(client, auth)["days"][:2]
    # Tomorrow's was already started (early).
    client.post(f"/plan/days/{second['id']}/start", headers=auth)
    assert client.post(f"/plan/days/{first['id']}/move", headers=auth).json() == {"date": (start + timedelta(days=2)).isoformat()}


def test_swapping_a_planned_exercise(client: TestClient, auth: dict):
    gym(client, auth, FULL_GYM)
    set_plan(client, auth)
    day = next(day for day in week(client, auth)["days"] if day["kind"] == "push")
    entry = day["exercises"][0]
    response = client.get(f"/plan/exercises/{entry['id']}/alternatives", headers=auth)
    assert response.status_code == 200
    options = response.json()
    assert options and len(options) <= 8
    assert not {option["id"] for option in options} & set(ids(day))
    assert all(option["equipment"] in (*FULL_GYM, "body only", None) for option in options)
    assert options[0]["id"] == "Dumbbell_Bench_Press"

    swapped = client.post(f"/plan/exercises/{entry['id']}/swap", headers=auth, json={"exercise_id": "Dumbbell_Bench_Press"}).json()
    first = swapped["exercises"][0]
    assert first["exercise_id"] == "Dumbbell_Bench_Press" and first["name"] == "Dumbbell Bench Press"
    assert first["swapped_from"] == "Barbell_Bench_Press_-_Medium_Grip"
    back = client.post(
        f"/plan/exercises/{entry['id']}/swap", headers=auth, json={"exercise_id": "Barbell_Bench_Press_-_Medium_Grip"}
    ).json()
    assert back["exercises"][0]["swapped_from"] is None
    assert client.post(f"/plan/exercises/{entry['id']}/swap", headers=auth, json={"exercise_id": "Nope"}).status_code == 422


def test_swapping_inside_a_session(client: TestClient, auth: dict):
    gym(client, auth, FULL_GYM)
    set_plan(client, auth)
    day = week(client, auth)["days"][0]
    session = client.post(f"/plan/days/{day['id']}/start", headers=auth).json()
    entry = session["exercises"][0]
    options = client.get(f"/training/workout-exercises/{entry['id']}/alternatives", headers=auth).json()
    assert options and entry["exercise_id"] not in {option["id"] for option in options}
    pick = options[0]["id"]
    swapped = client.post(f"/training/workout-exercises/{entry['id']}/swap", headers=auth, json={"exercise_id": pick}).json()
    assert swapped["exercises"][0]["exercise_id"] == pick and len(swapped["exercises"][0]["sets"]) == len(entry["sets"])

    row = swapped["exercises"][0]["sets"][0]
    client.patch(f"/workout-sets/{row['id']}", headers=auth, json={"done": True, "reps": 8, "weight": 40})
    blocked = client.post(f"/training/workout-exercises/{entry['id']}/swap", headers=auth, json={"exercise_id": options[1]["id"]})
    assert blocked.status_code == 409


def test_changing_the_plan_keeps_started_days(client: TestClient, auth: dict):
    set_plan(client, auth)
    days = week(client, auth)["days"]
    client.post(f"/plan/days/{days[0]['id']}/start", headers=auth)
    set_plan(client, auth, weekdays=[(today() + timedelta(days=3)).weekday()], goal="strength")
    after = week(client, auth)["days"]
    assert after[0]["id"] == days[0]["id"] and after[0]["status"] == "started"
    assert [day["date"] for day in after[1:]] == [(today() + timedelta(days=3)).isoformat()]


def test_stopping_the_plan(client: TestClient, auth: dict):
    set_plan(client, auth)
    days = week(client, auth)["days"]
    client.post(f"/plan/days/{days[0]['id']}/start", headers=auth)
    assert client.delete("/plan", headers=auth).status_code == 204
    assert client.get("/plan", headers=auth).json() is None
    assert client.get("/training/active", headers=auth).json() is not None


def test_someone_elses_plan_is_out_of_reach(client: TestClient, auth: dict):
    set_plan(client, auth)
    day = week(client, auth)["days"][0]
    other = bearer(sign_up(client, "other@example.com"))
    assert client.post(f"/plan/days/{day['id']}/start", headers=other).status_code == 404
    assert client.post(f"/plan/days/{day['id']}/move", headers=other).status_code == 404
    assert client.get(f"/plan/exercises/{day['exercises'][0]['id']}/alternatives", headers=other).status_code == 404
    assert week(client, other)["days"] == []


def test_export_has_the_plan(client: TestClient, auth: dict):
    set_plan(client, auth)
    week(client, auth)
    data = client.get("/export", headers=auth).json()
    assert len(data["training_plans"]) == 1 and len(data["planned_workouts"]) == 7 and data["planned_exercises"]
