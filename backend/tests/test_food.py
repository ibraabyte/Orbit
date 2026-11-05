"""Food tracking: saved foods, logging, search, barcode, the day view and the plate photo.

Open Food Facts, USDA and the AI providers are fakes (httpx2.MockTransport, a stand-in Anthropic client). Every food,
barcode and key here is made up.
"""

import base64
import json
from collections.abc import Iterator
from types import SimpleNamespace

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Food, Meal
from app.schemas.food import PlateEstimate, PlateItem
from app.services import chatgpt_ai, food_photo, food_sources, whoop_ai
from tests.conftest import bearer, sign_up

KABSA = {
    "name": "Home kabsa",
    "serving_label": "1 plate",
    "serving_grams": 450,
    "calories": 720,
    "protein_g": 38,
    "carbs_g": 85,
    "fat_g": 24,
}
NOON = "2026-11-02T12:30:00+03:00"
PHOTO = base64.b64encode(b"\xff\xd8\xff" + b"not-a-real-photo" * 20).decode()

OFF_PRODUCT = {
    "code": "6281000000017",
    "product_name": "Made-up Laban",
    "brands": "Test Dairy, Other",
    "serving_size": "200 ml",
    "serving_quantity": 200,
    "nutriments": {"energy-kcal_100g": 60, "proteins_100g": 3.1, "carbohydrates_100g": 4.6, "fat_100g": 3.2},
}
USDA_FOOD = {
    "fdcId": 100001,
    "description": "Rice, white, cooked (made-up)",
    "dataType": "SR Legacy",
    "foodNutrients": [
        {"nutrientNumber": "208", "unitName": "KCAL", "value": 130},
        {"nutrientNumber": "203", "unitName": "G", "value": 2.7},
        {"nutrientNumber": "204", "unitName": "G", "value": 0.3},
        {"nutrientNumber": "205", "unitName": "G", "value": 28.2},
    ],
}


class FakeSources:
    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.off_down = False
        self.products = {OFF_PRODUCT["code"]: OFF_PRODUCT}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.host == "world.openfoodfacts.org":
            if self.off_down:
                return httpx.Response(503)
            if request.url.path == "/cgi/search.pl":
                return httpx.Response(200, json={"count": 2, "products": [OFF_PRODUCT, {"code": "1", "product_name": "No numbers"}]})
            code = request.url.path.removeprefix("/api/v2/product/").removesuffix(".json")
            if code in self.products:
                return httpx.Response(200, json={"status": 1, "product": self.products[code]})
            return httpx.Response(404, json={"status": 0, "status_verbose": "product not found"})
        if request.url.host == "api.nal.usda.gov":
            if request.url.params.get("api_key") != "made-up-usda-key":
                return httpx.Response(403)
            return httpx.Response(200, json={"foods": [USDA_FOOD]})
        return httpx.Response(500)


@pytest.fixture
def sources(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeSources]:
    fake = FakeSources()
    food_sources._cache.clear()
    monkeypatch.setattr(food_sources, "transport", httpx.MockTransport(fake))
    monkeypatch.setattr(get_settings(), "usda_api_key", "made-up-usda-key")
    yield fake
    food_sources._cache.clear()


def other_user(client: TestClient) -> dict[str, str]:
    return bearer(sign_up(client, email="other@example.com"))


def add_kabsa(client: TestClient, auth: dict) -> dict:
    created = client.post("/foods", json=KABSA, headers=auth)
    assert created.status_code == 201, created.text
    return created.json()


def test_own_food_is_logged_with_servings_and_keeps_its_numbers(client: TestClient, auth: dict, db: Session):
    food = add_kabsa(client, auth)
    assert food["source"] == "custom" and food["last_used_at"] is None

    logged = client.post(f"/foods/{food['id']}/log", json={"servings": 1.5, "meal_type": "lunch", "logged_at": NOON}, headers=auth)
    assert logged.status_code == 201, logged.text
    meal = logged.json()
    assert meal["name"] == "Home kabsa"
    assert meal["calories"] == 1080
    assert (meal["protein_g"], meal["carbs_g"], meal["fat_g"]) == (57, 127.5, 36)
    assert (meal["food_id"], meal["servings"], meal["meal_type"]) == (food["id"], 1.5, "lunch")

    # Editing the food later doesn't rewrite what was already eaten.
    client.patch(f"/foods/{food['id']}", json={"calories": 500}, headers=auth)
    assert client.get(f"/meals/{meal['id']}", headers=auth).json()["calories"] == 1080
    assert [row["id"] for row in client.get("/food/recent", headers=auth).json()] == [food["id"]]

    # Deleting the food keeps the meal.
    assert client.delete(f"/foods/{food['id']}", headers=auth).status_code == 204
    kept = db.get(Meal, meal["id"])
    assert kept is not None and kept.food_id is None and kept.calories == 1080


def test_foods_are_private(client: TestClient, auth: dict):
    food = add_kabsa(client, auth)
    other = other_user(client)
    assert client.get("/foods", headers=other).json() == []
    assert client.post(f"/foods/{food['id']}/log", json={"logged_at": NOON}, headers=other).status_code == 404
    # Another user's food can't be attached to a meal either.
    sneaky = client.post("/meals", json={"name": "x", "calories": 1, "logged_at": NOON, "food_id": food["id"]}, headers=other)
    assert sneaky.status_code == 422


def test_food_limits(client: TestClient, auth: dict):
    assert client.post("/foods", json={**KABSA, "calories": -1}, headers=auth).status_code == 422
    assert client.post("/foods", json={**KABSA, "name": ""}, headers=auth).status_code == 422
    food = add_kabsa(client, auth)
    assert client.post(f"/foods/{food['id']}/log", json={"servings": 0, "logged_at": NOON}, headers=auth).status_code == 422
    assert client.post(f"/foods/{food['id']}/log", json={"meal_type": "brunch", "logged_at": NOON}, headers=auth).status_code == 422


def test_search_puts_own_foods_first_then_usda_and_open_food_facts(client: TestClient, auth: dict, sources: FakeSources):
    add_kabsa(client, auth)
    found = client.get("/food/search", params={"q": "kabsa"}, headers=auth)
    assert found.status_code == 200, found.text
    body = found.json()
    assert [r["source"] for r in body["results"]] == ["custom", "usda", "off"]
    assert body["notes"] == []

    rice = body["results"][1]
    assert (rice["name"], rice["serving_label"], rice["calories"], rice["carbs_g"]) == ("Rice, white, cooked (made-up)", "100 g", 130, 28.2)
    laban = body["results"][2]
    # Open Food Facts numbers are per 100 g; Orbit turns them into the product's own serving.
    assert (laban["brand"], laban["serving_label"], laban["serving_grams"], laban["calories"], laban["protein_g"]) == (
        "Test Dairy",
        "200 ml",
        200,
        120,
        6.2,
    )
    off_search = next(r for r in sources.requests if r.url.path == "/cgi/search.pl")
    assert off_search.headers["User-Agent"].startswith("Orbit/")
    assert off_search.url.params["search_terms"] == "kabsa"

    # The same search again is answered from memory.
    count = len(sources.requests)
    client.get("/food/search", params={"q": "Kabsa"}, headers=auth)
    assert len(sources.requests) == count


def test_search_says_which_source_is_missing(client: TestClient, auth: dict, sources: FakeSources, monkeypatch):
    monkeypatch.setattr(get_settings(), "usda_api_key", "")
    sources.off_down = True
    body = client.get("/food/search", params={"q": "rice"}, headers=auth).json()
    assert body["results"] == []
    assert any("USDA" in note for note in body["notes"])
    assert any("Open Food Facts" in note for note in body["notes"])
    assert not any(r.url.host == "api.nal.usda.gov" for r in sources.requests)
    assert client.get("/food/search", params={"q": "r"}, headers=auth).status_code == 422


def test_remember_saves_a_result_once_and_search_points_to_it(client: TestClient, auth: dict, sources: FakeSources, db: Session):
    result = client.get("/food/search", params={"q": "laban"}, headers=auth).json()["results"][-1]
    body = {k: v for k, v in result.items() if k != "food_id"}
    first = client.post("/food/remember", json=body, headers=auth)
    second = client.post("/food/remember", json={**body, "calories": 121}, headers=auth)
    assert first.status_code == 200, first.text
    assert first.json()["id"] == second.json()["id"]
    assert db.scalar(select(Food).where(Food.source == "off")).calories == 121

    again = client.get("/food/search", params={"q": "made-up"}, headers=auth).json()["results"]
    assert [r["source"] for r in again] == ["off", "usda"]  # the saved copy, not a second Open Food Facts row
    assert again[0]["food_id"] == first.json()["id"]


def test_barcode_finds_own_food_then_open_food_facts(client: TestClient, auth: dict, sources: FakeSources):
    found = client.get(f"/food/barcode/{OFF_PRODUCT['code']}", headers=auth)
    assert found.status_code == 200, found.text
    assert (found.json()["source"], found.json()["name"], found.json()["food_id"]) == ("off", "Made-up Laban", None)

    missing = client.get("/food/barcode/1234567890123", headers=auth)
    assert missing.status_code == 404
    assert "own food" in missing.json()["detail"]

    mine = client.post("/foods", json={**KABSA, "barcode": "1234567890123"}, headers=auth).json()
    assert client.get("/food/barcode/1234567890123", headers=auth).json()["food_id"] == mine["id"]
    assert client.get("/food/barcode/12ab", headers=auth).status_code == 422

    sources.off_down = True
    food_sources._cache.clear()
    assert client.get("/food/barcode/6281000000024", headers=auth).status_code == 502


def test_day_totals_and_targets(client: TestClient, auth: dict):
    client.patch("/profile", json={"daily_calorie_target": 2200, "daily_protein_target": 140}, headers=auth)
    food = add_kabsa(client, auth)
    client.post(f"/foods/{food['id']}/log", json={"logged_at": NOON}, headers=auth)
    client.post("/meals", json={"name": "Dates", "calories": 140, "carbs_g": 37.5, "logged_at": "2026-11-02T16:00:00+03:00"}, headers=auth)
    client.post("/meals", json={"name": "Yesterday", "calories": 900, "logged_at": "2026-11-01T22:00:00+03:00"}, headers=auth)

    day = client.get("/food/day", params={"start": "2026-11-02T00:00:00+03:00", "end": "2026-11-03T00:00:00+03:00"}, headers=auth)
    assert day.status_code == 200, day.text
    body = day.json()
    assert [meal["name"] for meal in body["meals"]] == ["Home kabsa", "Dates"]
    assert body["totals"] == {"calories": 860, "protein_g": 38, "carbs_g": 122.5, "fat_g": 24}
    assert body["targets"]["calories"] == 2200 and body["targets"]["protein_g"] == 140

    too_long = client.get("/food/day", params={"start": "2026-11-01T00:00:00+03:00", "end": "2026-11-05T00:00:00+03:00"}, headers=auth)
    assert too_long.status_code == 422


def test_foods_are_in_the_export(client: TestClient, auth: dict):
    add_kabsa(client, auth)
    assert [row["name"] for row in client.get("/export", headers=auth).json()["foods"]] == ["Home kabsa"]


# Parsing the public databases


def test_open_food_facts_without_a_serving_uses_100g_and_kilojoules():
    found = food_sources.off_candidate({"code": "123456", "product_name_en": "Made-up bar", "nutriments": {"energy_100g": 2092}})
    assert (found.name, found.serving_label, found.serving_grams, found.calories, found.protein_g) == (
        "Made-up bar",
        "100 g",
        100,
        500,
        None,
    )
    assert food_sources.off_candidate({"code": "123456", "product_name": "No energy", "nutriments": {}}) is None
    assert food_sources.off_candidate("not a product") is None


def test_usda_falls_back_to_atwater_energy():
    found = food_sources.usda_candidate(
        {
            "fdcId": 5,
            "description": "Egg, whole, raw (made-up)",
            "foodNutrients": [
                {"nutrientNumber": "268", "unitName": "kJ", "value": 600},
                {"nutrientNumber": "958", "unitName": "KCAL", "value": 143},
                {"nutrientNumber": "203", "unitName": "G", "value": 12.6},
            ],
        }
    )
    assert (found.source_id, found.calories, found.protein_g, found.fat_g) == ("5", 143, 12.6, None)


# The plate photo


PLATE = PlateEstimate(
    items=[
        PlateItem(
            name="Chicken kabsa rice",
            portion="1.5 cups",
            grams=300,
            calories=520,
            protein_g=9,
            carbs_g=80,
            fat_g=16,
            confidence="medium",
        ),
        PlateItem(name="Chicken leg", portion="1 piece", grams=-5, calories=-10, protein_g=25, carbs_g=0, fat_g=12, confidence="high"),
    ],
    note="Assumed ghee in the rice.",
)


def fake_claude(monkeypatch: pytest.MonkeyPatch, answer: SimpleNamespace) -> list[dict]:
    calls: list[dict] = []

    class Messages:
        def parse(self, **kwargs):
            calls.append(kwargs)
            return answer

    monkeypatch.setattr(whoop_ai, "_anthropic", lambda api_key: SimpleNamespace(beta=SimpleNamespace(messages=Messages())))
    monkeypatch.setattr(get_settings(), "anthropic_api_key", "made-up-anthropic-key")
    return calls


def test_photo_needs_an_ai(client: TestClient, auth: dict):
    answer = client.post("/food/photo", json={"image": PHOTO}, headers=auth)
    assert answer.status_code == 503
    assert "Integrations" in answer.json()["detail"]


def test_photo_asks_claude_and_returns_a_draft(client: TestClient, auth: dict, db: Session, monkeypatch):
    calls = fake_claude(monkeypatch, SimpleNamespace(stop_reason="end_turn", parsed_output=PLATE, model="claude-opus-5-5"))
    answer = client.post("/food/photo", json={"image": PHOTO, "note": "chicken kabsa"}, headers=auth)
    assert answer.status_code == 200, answer.text
    body = answer.json()
    assert body["model"] == "claude-opus-5-5"
    assert [item["name"] for item in body["items"]] == ["Chicken kabsa rice", "Chicken leg"]
    # Nonsense numbers from the model are cleaned up before the app sees them.
    assert body["items"][1]["grams"] is None and body["items"][1]["calories"] == 0

    call = calls[0]
    assert call["model"] == get_settings().insights_model
    assert call["output_format"] is PlateEstimate
    image, text = call["messages"][0]["content"]
    assert image["type"] == "image" and image["source"] == {"type": "base64", "media_type": "image/jpeg", "data": PHOTO}
    assert "chicken kabsa" in text["text"]
    assert "kabsa" in call["system"] and "Saudi" in call["system"]
    # Nothing is saved until the user confirms.
    assert db.scalar(select(Meal)) is None


def test_photo_refusal_and_bad_input(client: TestClient, auth: dict, monkeypatch):
    fake_claude(monkeypatch, SimpleNamespace(stop_reason="refusal", parsed_output=None, model="claude-opus-5-5"))
    assert client.post("/food/photo", json={"image": PHOTO}, headers=auth).status_code == 502
    assert client.post("/food/photo", json={"image": "!" * 200}, headers=auth).status_code == 422
    assert client.post("/food/photo", json={"image": PHOTO, "media_type": "image/gif"}, headers=auth).status_code == 422


def test_photo_with_an_openai_style_key_sends_the_image_as_a_data_url(monkeypatch):
    seen: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        content = "```json\n" + PLATE.model_dump_json() + "\n```"
        return httpx.Response(200, json={"model": "made-up-model", "choices": [{"message": {"content": content}}]})

    monkeypatch.setattr(whoop_ai, "transport", httpx.MockTransport(handler))
    access = whoop_ai.AiAccess("openai", "made-up-model", "made-up-key")
    found, model = food_photo.estimate(PHOTO, "image/png", None, access)
    assert model == "made-up-model" and len(found.items) == 2
    parts = seen[0]["messages"][1]["content"]
    assert parts[1] == {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{PHOTO}"}}
    assert seen[0]["response_format"]["json_schema"]["name"] == "plate"


def test_chatgpt_request_carries_the_photo():
    body = chatgpt_ai._body(
        "made-up-model",
        [
            {"role": "system", "content": "Be brief."},
            {"role": "user", "content": [{"type": "text", "text": "What is this?"}, {"type": "image_url", "image_url": {"url": "data:x"}}]},
        ],
        None,
    )
    assert body["instructions"] == "Be brief."
    assert body["input"] == [
        {
            "type": "message",
            "role": "user",
            "content": [{"type": "input_text", "text": "What is this?"}, {"type": "input_image", "image_url": "data:x"}],
        }
    ]
