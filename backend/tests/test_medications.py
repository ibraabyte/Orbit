"""Medications: the schedule, answering doses, and the stock kept in step. Medicine names are made up."""

from fastapi.testclient import TestClient

from tests.conftest import bearer, sign_up

MORNING = "2026-11-14T08:00:00+03:00"
EVENING = "2026-11-14T20:00:00+03:00"


def add(client: TestClient, auth: dict, **body) -> dict:
    response = client.post("/medications", headers=auth, json={"name": "Zentrol", "times": ["08:00"], **body})
    assert response.status_code == 201, response.text
    return response.json()


def answer(client: TestClient, auth: dict, medication: dict, at: str, status: str = "taken") -> dict:
    response = client.post(f"/medications/{medication['id']}/doses", headers=auth, json={"scheduled_at": at, "status": status})
    assert response.status_code in (200, 201), response.text
    return response.json()


def test_needs_sign_in(client: TestClient):
    for path in ("/medications", "/medications/doses"):
        assert client.get(path).status_code == 401


def test_a_daily_medicine_with_times_tidied(client: TestClient, auth: dict):
    row = add(client, auth, dose="500 mg", times=["20:00", "08:00", "08:00"], starts_on="2026-11-14")
    # Each time once, earliest first; daily keeps no weekdays and no step.
    assert row["times"] == ["08:00", "20:00"] and row["schedule"] == "daily"
    assert row["weekdays"] == [] and row["every_hours"] is None and row["paused"] is False
    assert row["per_dose"] == 1 and row["stock"] is None and row["starts_on"] == "2026-11-14"
    assert client.get("/medications", headers=auth).json()[0]["id"] == row["id"]


def test_schedules_are_checked(client: TestClient, auth: dict):
    bad = [
        {"times": []},
        {"times": ["8am"]},
        {"times": ["24:00"]},
        {"schedule": "weekdays", "weekdays": []},
        {"schedule": "weekdays", "weekdays": [7]},
        {"schedule": "interval"},
        {"schedule": "interval", "every_hours": 5},
        {"starts_on": "2026-11-14", "ends_on": "2026-11-10"},
        {"stock": -1},
        {"per_dose": 0},
    ]
    for body in bad:
        response = client.post("/medications", headers=auth, json={"name": "Zentrol", "times": ["08:00"], **body})
        assert response.status_code == 422, body

    days = add(client, auth, schedule="weekdays", weekdays=[4, 0, 0])
    assert days["weekdays"] == [0, 4]
    every = add(client, auth, schedule="interval", every_hours=8, times=["06:00", "14:00", "22:00"])
    assert every["every_hours"] == 8
    # every_hours only counts for an interval schedule.
    assert add(client, auth, every_hours=8)["every_hours"] is None


def test_switching_away_from_every_few_hours_drops_the_step(client: TestClient, auth: dict):
    row = add(client, auth, schedule="interval", every_hours=12, times=["08:00", "20:00"])
    response = client.patch(f"/medications/{row['id']}", headers=auth, json={"schedule": "daily", "times": ["09:00"]})
    assert response.status_code == 200, response.text
    assert response.json()["every_hours"] is None and response.json()["times"] == ["09:00"]
    # A course end before its start is refused by the database too.
    assert client.patch(f"/medications/{row['id']}", headers=auth, json={"ends_on": "2000-01-01"}).status_code == 422


def test_taking_a_dose_counts_down_the_stock(client: TestClient, auth: dict):
    row = add(client, auth, times=["08:00", "20:00"], stock=10, per_dose=2, low_stock_at=4)
    taken = answer(client, auth, row, MORNING)
    assert taken["dose"]["status"] == "taken" and taken["medication"]["stock"] == 8

    # The same moment again changes the answer instead of adding a second dose, and skipping gives the pills back.
    skipped = answer(client, auth, row, MORNING, "skipped")
    assert skipped["dose"]["id"] == taken["dose"]["id"] and skipped["medication"]["stock"] == 10
    again = answer(client, auth, row, MORNING)
    assert again["medication"]["stock"] == 8
    # Taking it twice for the same moment takes nothing more off.
    assert answer(client, auth, row, MORNING)["medication"]["stock"] == 8

    evening = answer(client, auth, row, EVENING)
    doses = client.get("/medications/doses", headers=auth).json()
    assert [dose["scheduled_at"] for dose in doses] == ["2026-11-14T17:00:00Z", "2026-11-14T05:00:00Z"]
    since = client.get("/medications/doses", headers=auth, params={"since": "2026-11-14T12:00:00Z"}).json()
    assert [dose["id"] for dose in since] == [evening["dose"]["id"]]

    # Taking a dose back puts it back into the stock.
    response = client.delete(f"/medications/doses/{evening['dose']['id']}", headers=auth)
    assert response.status_code == 200 and response.json()["stock"] == 8
    assert len(client.get("/medications/doses", headers=auth).json()) == 1


def test_stock_never_goes_below_zero_and_none_means_not_counted(client: TestClient, auth: dict):
    low = add(client, auth, stock=1, per_dose=2)
    assert answer(client, auth, low, MORNING)["medication"]["stock"] == 0
    uncounted = add(client, auth, name="Calmira")
    assert answer(client, auth, uncounted, MORNING)["medication"]["stock"] is None


def test_deleting_a_medicine_takes_its_log(client: TestClient, auth: dict):
    row = add(client, auth)
    answer(client, auth, row, MORNING)
    assert client.delete(f"/medications/{row['id']}", headers=auth).status_code == 204
    assert client.get("/medications/doses", headers=auth).json() == []


def test_medicines_are_private(client: TestClient, auth: dict):
    row = add(client, auth)
    dose = answer(client, auth, row, MORNING)["dose"]
    other = bearer(sign_up(client, "other@example.com"))
    assert client.get("/medications", headers=other).json() == []
    assert client.get("/medications/doses", headers=other).json() == []
    assert client.post(f"/medications/{row['id']}/doses", headers=other, json={"scheduled_at": MORNING}).status_code == 404
    assert client.delete(f"/medications/doses/{dose['id']}", headers=other).status_code == 404
    assert client.patch(f"/medications/{row['id']}", headers=other, json={"paused": True}).status_code == 404


def test_medications_section_can_be_switched_off(client: TestClient, auth: dict):
    response = client.patch("/profile", headers=auth, json={"hidden_sections": ["medications"]})
    assert response.status_code == 200, response.text
    assert response.json()["hidden_sections"] == ["medications"]
