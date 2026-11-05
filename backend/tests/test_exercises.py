from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Exercise
from app.models.fitness import GYM_EQUIPMENT, INJURY_AREAS
from app.services import exercise_catalog as catalog
from tests.conftest import bearer, sign_up


def search(client: TestClient, auth: dict, **params) -> dict:
    response = client.get("/exercises", headers=auth, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def names(result: dict) -> list[str]:
    return [item["name"] for item in result["items"]]


def test_migration_loads_the_whole_catalogue(db: Session):
    assert db.scalar(select(func.count()).select_from(Exercise)) == len(catalog.load_catalog()) > 800
    squat = db.get(Exercise, "Barbell_Squat")
    assert squat.equipment == "barbell"
    assert squat.primary_muscles == ["quadriceps"]
    assert squat.instructions and squat.images


def test_catalogue_sync_is_safe_to_repeat(db: Session):
    before = db.scalar(select(func.count()).select_from(Exercise))
    assert catalog.sync_catalog(db.connection()) == before
    db.commit()
    assert db.scalar(select(func.count()).select_from(Exercise)) == before


def test_search_needs_sign_in(client: TestClient):
    assert client.get("/exercises").status_code == 401
    assert client.get("/gym/equipment").status_code == 401
    assert client.get("/injuries").status_code == 401


def test_search_by_name_muscle_and_equipment(client: TestClient, auth: dict):
    result = search(client, auth, q="barbell squat", limit=200)
    assert "Barbell Squat" in names(result)
    assert all("barbell" in name.lower() and "squat" in name.lower() for name in names(result))

    chest = search(client, auth, muscle="chest", equipment="dumbbell", limit=200)
    assert chest["total"] == len(chest["items"]) > 0
    assert all("chest" in item["primary_muscles"] and item["equipment"] == "dumbbell" for item in chest["items"])

    bodyweight = search(client, auth, equipment="body only", limit=200)
    assert {item["equipment"] for item in bodyweight["items"]} <= {"body only", None}

    # Wildcards in the search box are plain text.
    assert search(client, auth, q="%")["total"] == 0
    assert client.get("/exercises", headers=auth, params={"muscle": "wings"}).status_code == 422


def test_search_pages(client: TestClient, auth: dict):
    first = search(client, auth, limit=10)
    second = search(client, auth, limit=10, offset=10)
    assert first["total"] == second["total"] > 800
    assert not set(names(first)) & set(names(second))
    assert names(first) == sorted(names(first))


def test_detail_has_instructions_and_image_urls(client: TestClient, auth: dict):
    detail = client.get("/exercises/Barbell_Squat", headers=auth).json()
    assert detail["instructions"]
    assert detail["image_urls"][0].startswith(catalog.IMAGE_BASE_URL)
    assert detail["image_url"] == detail["image_urls"][0]
    assert detail["in_my_gym"] is False
    assert client.get("/exercises/Not_A_Real_One", headers=auth).status_code == 404


def test_gym_equipment_filters_to_what_the_gym_has(client: TestClient, auth: dict):
    assert client.get("/gym/equipment", headers=auth).json() == {"equipment": [], "always": ["body only"]}

    # With nothing picked yet, only exercises that need no equipment fit.
    empty = search(client, auth, only_my_gym=True, limit=200)
    assert {item["equipment"] for item in empty["items"]} <= {"body only", None}
    assert empty["hidden_by_gym"] > 0

    saved = client.put("/gym/equipment", headers=auth, json={"equipment": ["dumbbell", "cable", "dumbbell"]})
    assert saved.status_code == 200
    assert saved.json()["equipment"] == ["cable", "dumbbell"]

    mine = search(client, auth, only_my_gym=True, limit=200, offset=0)
    total = mine["total"]
    seen: set[str | None] = set()
    for offset in range(0, total, 200):
        seen |= {item["equipment"] for item in search(client, auth, only_my_gym=True, limit=200, offset=offset)["items"]}
    assert seen == {"cable", "dumbbell", "body only", None}
    assert total + mine["hidden_by_gym"] == search(client, auth)["total"]
    assert search(client, auth, only_my_gym=True, equipment="barbell")["total"] == 0

    assert client.get("/exercises/Barbell_Squat", headers=auth).json()["in_my_gym"] is False
    assert client.get("/exercises/Dumbbell_Bench_Press", headers=auth).json()["in_my_gym"] is True

    # Replacing the list drops what was unticked.
    client.put("/gym/equipment", headers=auth, json={"equipment": ["barbell"]})
    assert client.get("/gym/equipment", headers=auth).json()["equipment"] == ["barbell"]
    assert client.put("/gym/equipment", headers=auth, json={"equipment": ["body only"]}).status_code == 422
    assert client.put("/gym/equipment", headers=auth, json={"equipment": ["spaceship"]}).status_code == 422


def test_active_injury_hides_exercises_that_mainly_work_it(client: TestClient, auth: dict):
    everything = search(client, auth, muscle="quadriceps")["total"]
    injury = client.post("/injuries", headers=auth, json={"area": "knee", "note": "Sore after running", "started_on": "2026-10-20"})
    assert injury.status_code == 201, injury.text

    knees = search(client, auth, muscle="quadriceps")
    assert knees["total"] == 0
    assert knees["hidden_by_injuries"] == everything

    # Squats work the knee as the main muscle: gone. A deadlift only uses it as a helper: shown with a caution.
    all_names = set()
    for offset in range(0, 1000, 200):
        page = search(client, auth, limit=200, offset=offset)
        all_names |= set(names(page))
        for item in page["items"]:
            assert not {"quadriceps", "hamstrings"} & set(item["primary_muscles"])
            assert item["avoid"] == []
    assert "Barbell Squat" not in all_names

    calf = client.get("/exercises/Standing_Calf_Raises", headers=auth).json()
    assert calf["avoid"] == []
    squat = client.get("/exercises/Barbell_Squat", headers=auth).json()
    assert squat["avoid"] == ["knee"]

    shown_anyway = search(client, auth, q="barbell squat", include_injured=True)
    assert "Barbell Squat" in names(shown_anyway)
    assert shown_anyway["hidden_by_injuries"] == 0
    assert next(item for item in shown_anyway["items"] if item["name"] == "Barbell Squat")["avoid"] == ["knee"]

    cautious = [item for item in search(client, auth, limit=200, q="deadlift")["items"] if item["caution"]]
    assert cautious and all(item["caution"] == ["knee"] or "knee" in item["caution"] for item in cautious)

    # Healed: everything is back.
    client.patch(f"/injuries/{injury.json()['id']}", headers=auth, json={"active": False, "ended_on": "2026-11-01"})
    assert search(client, auth, muscle="quadriceps")["total"] == everything
    assert search(client, auth)["hidden_by_injuries"] == 0


def test_injuries_are_per_user_and_validated(client: TestClient, auth: dict):
    mine = client.post("/injuries", headers=auth, json={"area": "lower back"}).json()
    assert mine["active"] is True

    other = bearer(sign_up(client, "other@example.com"))
    assert client.get("/injuries", headers=other).json() == []
    assert client.patch(f"/injuries/{mine['id']}", headers=other, json={"active": False}).status_code == 404
    assert client.delete(f"/injuries/{mine['id']}", headers=other).status_code == 404
    # Someone else's injury doesn't change what I see, and mine doesn't change theirs.
    assert search(client, other)["hidden_by_injuries"] == 0
    assert search(client, auth)["hidden_by_injuries"] > 0

    client.put("/gym/equipment", headers=auth, json={"equipment": ["machine"]})
    assert client.get("/gym/equipment", headers=other).json()["equipment"] == []

    assert client.post("/injuries", headers=auth, json={"area": "tail"}).status_code == 422
    assert client.post("/injuries", headers=auth, json={"area": "knee", "note": "x" * 501}).status_code == 422
    backwards = client.post("/injuries", headers=auth, json={"area": "knee", "started_on": "2026-10-10", "ended_on": "2026-10-01"})
    assert backwards.status_code == 422

    assert client.delete(f"/injuries/{mine['id']}", headers=auth).status_code == 204
    assert client.get("/injuries", headers=auth).json() == []


def test_every_area_and_gym_item_is_allowed_by_the_database(client: TestClient, auth: dict):
    for area in INJURY_AREAS:
        assert client.post("/injuries", headers=auth, json={"area": area}).status_code == 201, area
    assert client.put("/gym/equipment", headers=auth, json={"equipment": list(GYM_EQUIPMENT)}).status_code == 200
    # Every area maps only to muscles the dataset uses.
    used = {muscle for row in catalog.load_catalog() for muscle in row["primary_muscles"] + row["secondary_muscles"]}
    assert {muscle for muscles in INJURY_AREAS.values() for muscle in muscles} <= used


def test_export_includes_gym_and_injuries(client: TestClient, auth: dict):
    client.put("/gym/equipment", headers=auth, json={"equipment": ["kettlebells"]})
    client.post("/injuries", headers=auth, json={"area": "wrist"})
    data = client.get("/export", headers=auth).json()
    assert [row["equipment"] for row in data["gym_equipment"]] == ["kettlebells"]
    assert [row["area"] for row in data["injuries"]] == ["wrist"]
    assert "exercises" not in data


def test_conflict_rules():
    covered = catalog.muscles_for(["knee", "lower back"])
    assert covered == {"quadriceps": ["knee"], "hamstrings": ["knee"], "lower back": ["lower back"]}
    assert catalog.conflicts(["hamstrings"], ["lower back", "glutes"], covered) == (["knee"], ["lower back"])
    assert catalog.conflicts(["chest"], ["quadriceps"], covered) == ([], ["knee"])
    # An area already avoided isn't repeated as a caution.
    assert catalog.conflicts(["quadriceps"], ["hamstrings"], covered) == (["knee"], [])
