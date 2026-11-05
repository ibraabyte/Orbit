"""Food search and barcode lookup in two free public databases.

- Open Food Facts (openfoodfacts.org): packaged products and barcodes. No key; it asks for a User-Agent that names the app.
- USDA FoodData Central (fdc.nal.usda.gov): basic foods like rice, chicken and eggs. Needs a free key (ORBIT_USDA_API_KEY).

Only the search words or the barcode leave the server. Results are kept in memory for a few minutes, so typing the
same search again doesn't ask the services twice; the user's picks are saved in their own foods table.
"""

import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx2 as httpx

from app.config import get_settings
from app.schemas.food import Candidate

OFF_URL = "https://world.openfoodfacts.org"
USDA_URL = "https://api.nal.usda.gov/fdc/v1"
USER_AGENT = "Orbit/0.3 (personal life dashboard; https://github.com/ibraabyte/Orbit)"
OFF_FIELDS = "code,product_name,product_name_en,product_name_ar,generic_name,brands,nutriments,serving_size,serving_quantity"
# Basic foods, per 100 g. Branded US products are left to Open Food Facts.
USDA_TYPES = ["Foundation", "SR Legacy", "Survey (FNDDS)"]
# FoodData Central nutrient numbers. Some Foundation foods only carry the Atwater energy values (957, 958).
USDA_ENERGY = ("208", "957", "958")
USDA_PROTEIN, USDA_FAT, USDA_CARBS = "203", "204", "205"
BARCODE = re.compile(r"^\d{6,14}$")
CACHE_SECONDS = 600
PAGE_SIZE = 10

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None
_cache: dict[tuple[str, str], tuple[float, Any]] = {}


class SourceUnavailable(Exception):
    """A service didn't answer usefully; the message is safe to show in the app."""


def _client() -> httpx.Client:
    return httpx.Client(transport=transport, timeout=10.0, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})


def _get_json(url: str, params: dict[str, Any] | list[tuple[str, Any]], name: str) -> Any:
    try:
        with _client() as client:
            response = client.get(url, params=params)
    except httpx.HTTPError as exc:
        raise SourceUnavailable(f"{name} didn't answer. Try again in a minute.") from exc
    if response.status_code == 404:
        return None
    if response.status_code == 429:
        raise SourceUnavailable(f"{name} is busy. Try again in a minute.")
    if response.status_code in (401, 403):
        raise SourceUnavailable(f"{name} refused the server's key.")
    if response.status_code != 200:
        raise SourceUnavailable(f"{name} answered with an error ({response.status_code}).")
    try:
        return response.json()
    except ValueError as exc:
        raise SourceUnavailable(f"{name} sent an answer Orbit can't read.") from exc


def _cached(key: tuple[str, str], load: Any) -> Any:
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    value = load()
    if len(_cache) > 500:
        _cache.clear()
    _cache[key] = (time.monotonic() + CACHE_SECONDS, value)
    return value


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    elif isinstance(value, str):
        try:
            number = float(value.strip().replace(",", "."))
        except ValueError:
            return None
    else:
        return None
    return number if number >= 0 and number == number and number != float("inf") else None


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def _text(value: Any, limit: int) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.split())
    return cleaned[:limit] or None


def off_candidate(product: Any) -> Candidate | None:
    """One Open Food Facts product as a food: per its stated serving when it has one, otherwise per 100 g."""
    if not isinstance(product, dict):
        return None
    nutriments = product.get("nutriments") if isinstance(product.get("nutriments"), dict) else {}
    kcal = _number(nutriments.get("energy-kcal_100g"))
    if kcal is None:
        kilojoules = _number(nutriments.get("energy_100g"))
        kcal = kilojoules / 4.184 if kilojoules is not None else None
    names = (_text(product.get(key), 220) for key in ("product_name", "product_name_en", "product_name_ar", "generic_name"))
    name = next((found for found in names if found), None)
    code = _text(product.get("code"), 32)
    if kcal is None or name is None or code is None:
        return None
    brand = _text((product.get("brands") or "").split(",")[0] if isinstance(product.get("brands"), str) else None, 220)
    grams = _number(product.get("serving_quantity"))
    if grams is not None and 0 < grams <= 5000:
        label = _text(product.get("serving_size"), 80) or f"{grams:g} g"
    else:
        grams, label = 100.0, "100 g"
    scale = grams / 100

    def per_serving(key: str) -> float | None:
        value = _number(nutriments.get(key))
        return _round(value * scale) if value is not None else None

    return Candidate(
        source="off",
        source_id=code,
        name=name,
        brand=brand,
        barcode=code,
        serving_label=label,
        serving_grams=grams,
        calories=round(kcal * scale, 1),
        protein_g=per_serving("proteins_100g"),
        carbs_g=per_serving("carbohydrates_100g"),
        fat_g=per_serving("fat_100g"),
    )


def usda_candidate(food: Any) -> Candidate | None:
    """One FoodData Central food as a food per 100 g (how these data types report nutrients)."""
    if not isinstance(food, dict) or not isinstance(food.get("fdcId"), int):
        return None
    values: dict[str, float] = {}
    for nutrient in food.get("foodNutrients") or []:
        if not isinstance(nutrient, dict):
            continue
        number = str(nutrient.get("nutrientNumber") or "")
        unit = str(nutrient.get("unitName") or "").upper()
        value = _number(nutrient.get("value"))
        if value is None or number in values:
            continue
        if number in USDA_ENERGY and unit != "KCAL":
            continue
        values[number] = value
    kcal = next((values[number] for number in USDA_ENERGY if number in values), None)
    name = _text(food.get("description"), 220)
    if kcal is None or name is None:
        return None
    return Candidate(
        source="usda",
        source_id=str(food["fdcId"]),
        name=name,
        brand=_text(food.get("brandOwner"), 220),
        serving_label="100 g",
        serving_grams=100,
        calories=round(kcal, 1),
        protein_g=_round(values.get(USDA_PROTEIN)),
        carbs_g=_round(values.get(USDA_CARBS)),
        fat_g=_round(values.get(USDA_FAT)),
    )


def search_off(query: str) -> list[Candidate]:
    def load() -> list[Candidate]:
        params = {"search_terms": query, "search_simple": 1, "action": "process", "json": 1, "page_size": PAGE_SIZE, "fields": OFF_FIELDS}
        data = _get_json(f"{OFF_URL}/cgi/search.pl", params, "Open Food Facts") or {}
        products = data.get("products") if isinstance(data, dict) else None
        return [found for product in products or [] if (found := off_candidate(product))]

    return _cached(("off", query.casefold()), load)


def search_usda(query: str) -> list[Candidate]:
    key = get_settings().usda_api_key
    if not key:
        return []

    def load() -> list[Candidate]:
        params: list[tuple[str, Any]] = [("api_key", key), ("query", query), ("pageSize", PAGE_SIZE)]
        params += [("dataType", kind) for kind in USDA_TYPES]
        data = _get_json(f"{USDA_URL}/foods/search", params, "USDA") or {}
        foods = data.get("foods") if isinstance(data, dict) else None
        return [found for food in foods or [] if (found := usda_candidate(food))]

    return _cached(("usda", query.casefold()), load)


def search(query: str) -> tuple[list[Candidate], list[str]]:
    """Both sources at once. A failing source becomes a note; the other's results still come back."""
    notes: list[str] = []
    if not get_settings().usda_api_key:
        notes.append("Basic foods from USDA are off until the server has a USDA key.")
    results: list[Candidate] = []
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(search_usda, query), pool.submit(search_off, query)]
        for future in futures:
            try:
                results += future.result()
            except SourceUnavailable as exc:
                notes.append(str(exc))
    return results, notes


def lookup_barcode(code: str) -> Candidate | None:
    if not BARCODE.match(code):
        raise ValueError("A barcode is 6 to 14 digits.")

    def load() -> Candidate | None:
        data = _get_json(f"{OFF_URL}/api/v2/product/{code}.json", {"fields": OFF_FIELDS}, "Open Food Facts")
        if not isinstance(data, dict) or data.get("status") != 1:
            return None
        return off_candidate(data.get("product"))

    return _cached(("barcode", code), load)
