"""Gym sessions set by set, exercise history and personal bests, and body measurements."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models as m
from tests.conftest import bearer, sign_up

SQUAT = "Barbell_Squat"


def start(client: TestClient, auth: dict, **body) -> dict:
    response = client.post("/training/sessions", headers=auth, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def add(client: TestClient, auth: dict, session: dict, **body) -> dict:
    response = client.post(f"/training/sessions/{session['id']}/exercises", headers=auth, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def log(client: TestClient, auth: dict, row: dict, weight: float | None, reps: int, **extra) -> dict:
    response = client.patch(f"/workout-sets/{row['id']}", headers=auth, json={"weight": weight, "reps": reps, "done": True, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def history(client: TestClient, auth: dict, **params) -> dict:
    response = client.get("/training/history", headers=auth, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def squat_session(client: TestClient, auth: dict, day: str, sets: list[tuple[float, int]], unit: str = "kg") -> dict:
    session = start(client, auth, type="Legs", logged_at=f"{day}T17:00:00+03:00")
    entry = add(client, auth, session, exercise_id=SQUAT, sets=len(sets))["exercises"][-1]
    for row, (weight, reps) in zip(entry["sets"], sets, strict=True):
        log(client, auth, row, weight, reps, unit=unit)
    return client.post(f"/training/sessions/{session['id']}/finish", headers=auth, json={"ended_at": f"{day}T18:05:00+03:00"}).json()


def test_needs_sign_in(client: TestClient):
    for path in ("/training/active", "/training/sessions", "/workout-sets", "/body-measurements"):
        assert client.get(path).status_code == 401


def test_a_session_from_start_to_finish(client: TestClient, auth: dict):
    assert client.get("/training/active", headers=auth).json() is None
    session = start(client, auth, type="Push day")
    assert session["in_progress"] is True and session["exercises"] == []
    assert client.get("/training/active", headers=auth).json()["id"] == session["id"]

    session = add(client, auth, session, exercise_id=SQUAT)
    entry = session["exercises"][0]
    # The catalogue's name and photo, three empty sets, the default rest.
    assert entry["name"] == "Barbell Squat" and entry["image_url"].startswith("https://")
    assert [row["position"] for row in entry["sets"]] == [0, 1, 2]
    assert entry["rest_seconds"] == 90 and not any(row["done"] for row in entry["sets"])
    session = add(client, auth, session, name="  Sled push ", sets=1)
    assert [e["name"] for e in session["exercises"]] == ["Barbell Squat", "Sled push"]
    assert session["exercises"][1]["position"] == 1 and session["exercises"][1]["exercise_id"] is None

    done = log(client, auth, entry["sets"][0], 60, 8)
    assert done["done_at"] is not None and done["weight"] == 60
    undone = client.patch(f"/workout-sets/{done['id']}", headers=auth, json={"done": False}).json()
    assert undone["done_at"] is None and undone["weight"] == 60

    finished = client.post(
        f"/training/sessions/{session['id']}/finish", headers=auth, json={"ended_at": session["logged_at"].replace("Z", "+00:00")}
    )
    assert finished.status_code == 200
    assert finished.json()["in_progress"] is False and finished.json()["duration_minutes"] == 0
    assert client.get("/training/active", headers=auth).json() is None


def test_session_list_leaves_out_one_line_workouts(client: TestClient, auth: dict):
    client.post("/workouts", headers=auth, json={"type": "Run", "duration_minutes": 30, "logged_at": "2026-11-01T06:00:00Z"})
    squat_session(client, auth, "2026-11-02", [(100, 5), (100, 5)])
    live = start(client, auth, type="Pull")
    rows = client.get("/training/sessions", headers=auth).json()
    assert [row["type"] for row in rows] == ["Pull", "Legs"]
    assert rows[0]["in_progress"] and rows[0]["sets_done"] == 0
    legs = rows[1]
    assert legs["exercise_names"] == ["Barbell Squat"] and legs["sets_done"] == 2
    assert legs["volume_kg"] == 1000 and legs["duration_minutes"] == 65
    # The whole session goes with its exercises and sets.
    assert client.delete(f"/workouts/{live['id']}", headers=auth).status_code == 204
    assert client.delete(f"/workouts/{legs['id']}", headers=auth).status_code == 204
    assert client.get("/training/sessions", headers=auth).json() == []
    assert client.get("/workout-sets", headers=auth).json() == []


def test_history_last_time_and_personal_bests(client: TestClient, auth: dict):
    squat_session(client, auth, "2026-10-20", [(80, 8), (80, 8), (80, 7)])
    squat_session(client, auth, "2026-10-27", [(90, 5), (100, 2), (60, 15)])
    # 225 lb is 102 kg: the heaviest, even in pounds.
    squat_session(client, auth, "2026-11-03", [(225, 1)], unit="lb")

    result = history(client, auth, exercise_id=SQUAT)
    assert [row["logged_at"][:10] for row in result["sessions"]] == ["2026-11-03", "2026-10-27", "2026-10-20"]
    assert result["sessions"][1]["sets"] == [
        {"weight": 90, "unit": "kg", "reps": 5, "warmup": False},
        {"weight": 100, "unit": "kg", "reps": 2, "warmup": False},
        {"weight": 60, "unit": "kg", "reps": 15, "warmup": False},
    ]
    bests = result["bests"]
    assert (bests["heaviest"]["weight"], bests["heaviest"]["unit"]) == (225, "lb")
    # Epley: 100 x (1 + 2/30) = 106.7 beats 90 x (1 + 5/30) = 105 and 225 lb (102 kg); 15 reps is too many to count.
    assert bests["one_rep_max"]["value"] == 106.7 and bests["one_rep_max"]["reps"] == 2
    assert bests["most_reps"]["reps"] == 15
    # 80x8 + 80x8 + 80x7 = 1840 kg beats 450 + 200 + 900 = 1550.
    assert bests["best_volume"]["value"] == 1840 and bests["best_volume"]["logged_at"].startswith("2026-10-20")


def test_new_exercise_starts_from_last_time(client: TestClient, auth: dict):
    squat_session(client, auth, "2026-10-27", [(90, 5), (95, 4)])
    old = client.get("/training/sessions", headers=auth).json()[0]
    entry_id = client.get(f"/training/sessions/{old['id']}", headers=auth).json()["exercises"][0]["id"]
    client.patch(f"/workout-exercises/{entry_id}", headers=auth, json={"rest_seconds": 150})

    session = start(client, auth)
    entry = add(client, auth, session, exercise_id=SQUAT, sets=3)["exercises"][0]
    assert [(row["weight"], row["reps"]) for row in entry["sets"]] == [(90, 5), (95, 4), (95, 4)]
    assert entry["rest_seconds"] == 150
    # Undone sets in this session don't count as "last time".
    assert history(client, auth, exercise_id=SQUAT, exclude_workout=session["id"])["sessions"][0]["sets"][0]["weight"] == 90
    assert len(history(client, auth, exercise_id=SQUAT)["sessions"]) == 1


def test_warmups_are_logged_but_not_records(client: TestClient, auth: dict):
    session = start(client, auth)
    entry = add(client, auth, session, exercise_id=SQUAT, sets=2)["exercises"][0]
    log(client, auth, entry["sets"][0], 140, 3, warmup=True)
    log(client, auth, entry["sets"][1], 100, 5)
    bests = history(client, auth, exercise_id=SQUAT)["bests"]
    assert bests["heaviest"]["weight"] == 100
    assert history(client, auth, exercise_id=SQUAT)["sessions"][0]["volume_kg"] == 500


def test_typed_in_exercises_match_by_name(client: TestClient, auth: dict):
    session = start(client, auth)
    entry = add(client, auth, session, name="Sled Push", sets=1)["exercises"][0]
    log(client, auth, entry["sets"][0], None, 20)
    result = history(client, auth, name="sled push")
    assert result["sessions"][0]["sets"][0]["reps"] == 20
    assert result["bests"]["most_reps"]["reps"] == 20 and result["bests"]["heaviest"] is None
    assert client.get("/training/history", headers=auth).status_code == 422


def test_repeat_a_past_session(client: TestClient, auth: dict):
    done = squat_session(client, auth, "2026-10-27", [(90, 5), (95, 4)])
    again = start(client, auth, repeat_of=done["id"])
    assert again["type"] == "Legs" and again["id"] != done["id"]
    sets = again["exercises"][0]["sets"]
    assert [(row["weight"], row["reps"], row["done"]) for row in sets] == [(90, 5, False), (95, 4, False)]


def test_bad_input_is_refused(client: TestClient, auth: dict):
    session = start(client, auth)
    assert client.post(f"/training/sessions/{session['id']}/exercises", headers=auth, json={"sets": 2}).status_code == 422
    assert client.post(f"/training/sessions/{session['id']}/exercises", headers=auth, json={"exercise_id": "Nope"}).status_code == 422
    entry = add(client, auth, session, exercise_id=SQUAT, sets=1)["exercises"][0]
    for body in ({"reps": -1}, {"weight": 5000}, {"unit": "stone"}):
        assert client.patch(f"/workout-sets/{entry['sets'][0]['id']}", headers=auth, json=body).status_code == 422
    assert client.patch(f"/workout-exercises/{entry['id']}", headers=auth, json={"rest_seconds": 9999}).status_code == 422


def test_other_people_cant_see_or_join_my_sessions(client: TestClient, auth: dict):
    mine = start(client, auth)
    entry = add(client, auth, mine, exercise_id=SQUAT, sets=1)["exercises"][0]
    other = bearer(sign_up(client, "other@example.com"))
    assert client.get(f"/training/sessions/{mine['id']}", headers=other).status_code == 404
    assert client.post(f"/training/sessions/{mine['id']}/exercises", headers=other, json={"name": "x"}).status_code == 404
    assert client.post(f"/training/sessions/{mine['id']}/finish", headers=other, json={}).status_code == 404
    assert client.patch(f"/workout-sets/{entry['sets'][0]['id']}", headers=other, json={"reps": 1}).status_code == 404
    assert client.get("/training/active", headers=other).json() is None
    assert client.get("/training/sessions", headers=other).json() == []
    assert history(client, other, exercise_id=SQUAT)["sessions"] == []
    # Their own rows can't hang under my session or my exercise.
    joined = client.post("/workout-exercises", headers=other, json={"workout_id": mine["id"], "name": "Sneaky"})
    assert joined.status_code == 422
    assert client.post("/workout-sets", headers=other, json={"workout_exercise_id": entry["id"], "reps": 1}).status_code == 422
    # They can't copy it either.
    assert client.post("/training/sessions", headers=other, json={"repeat_of": mine["id"]}).status_code == 404


def test_body_measurements(client: TestClient, auth: dict):
    first = client.post(
        "/body-measurements", headers=auth, json={"kind": "waist", "value": 86.5, "unit": "cm", "measured_at": "2026-10-01T08:00:00Z"}
    )
    assert first.status_code == 201 and first.json()["value"] == 86.5
    client.post(
        "/body-measurements", headers=auth, json={"kind": "waist", "value": 84, "unit": "cm", "measured_at": "2026-11-01T08:00:00Z"}
    )
    client.post(
        "/body-measurements", headers=auth, json={"kind": "body_fat", "value": 18.2, "unit": "%", "measured_at": "2026-11-01T08:00:00Z"}
    )
    rows = client.get("/body-measurements", headers=auth).json()
    assert [(row["kind"], row["value"]) for row in rows][:2] in ([("waist", 84), ("body_fat", 18.2)], [("body_fat", 18.2), ("waist", 84)])
    assert rows[-1]["value"] == 86.5
    for bad in (
        {"kind": "waist", "value": 80, "unit": "%"},
        {"kind": "body_fat", "value": 20, "unit": "cm"},
        {"kind": "wingspan", "value": 180, "unit": "cm"},
        {"kind": "arm", "value": 0, "unit": "cm"},
    ):
        assert client.post("/body-measurements", headers=auth, json={**bad, "measured_at": "2026-11-01T08:00:00Z"}).status_code == 422
    other = bearer(sign_up(client, "other@example.com"))
    assert client.get("/body-measurements", headers=other).json() == []
    assert client.delete(f"/body-measurements/{first.json()['id']}", headers=other).status_code == 404


def test_export_and_account_deletion(client: TestClient, me: dict, db: Session):
    auth = bearer(me)
    squat_session(client, auth, "2026-10-27", [(90, 5)])
    client.post(
        "/body-measurements", headers=auth, json={"kind": "chest", "value": 101, "unit": "cm", "measured_at": "2026-11-01T08:00:00Z"}
    )
    data = client.get("/export", headers=auth).json()
    assert len(data["workout_exercises"]) == 1 and len(data["workout_sets"]) == 1 and len(data["body_measurements"]) == 1
    assert data["workouts"][0]["in_progress"] is False
    assert client.post("/auth/delete-account", headers=auth, json={"password": "correct horse battery"}).status_code == 204
    for model in (m.Workout, m.WorkoutExercise, m.WorkoutSet, m.BodyMeasurement):
        assert db.scalar(select(func.count()).select_from(model)) == 0, model.__name__
