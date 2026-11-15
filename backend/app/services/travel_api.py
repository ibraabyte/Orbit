"""Flight and hotel prices from Google Flights and Google Hotels, through the user's own SerpApi key. Read only: Orbit
shows the options and links to Google to book; it never books or pays.

Each user brings their own key (serpapi.com → sign up → Dashboard → Your private API key). It is stored encrypted in
service_connections (provider "serpapi") and never sent back to the app. The free plan gives 250 searches a month; a
flight search is one, a hotel search is one, and checking the account is free.

GET https://serpapi.com/search.json?engine=google_flights|google_hotels&api_key=... answers JSON. A failed search
answers {"error": "..."} (401 for a wrong key, 429 when the month's searches are used up).
"""

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import httpx2 as httpx

BASE_URL = "https://serpapi.com"
PROVIDER = "serpapi"
SIGNUP_URL = "https://serpapi.com/users/sign_up"

# Google Flights' own numbers for the cabin and how many stops are fine.
CABINS = {"economy": 1, "premium": 2, "business": 3, "first": 4}
STOPS = {"any": 0, "nonstop": 1, "one": 2}
# Google Hotels: sort by lowest price, or by best rating.
HOTEL_SORT = {"price": 3, "rating": 8}

log = logging.getLogger("orbit.travel")

# Replaced in tests with httpx2.MockTransport.
transport: httpx.BaseTransport | None = None


class TravelError(Exception):
    pass


class KeyRejected(TravelError):
    """SerpApi said the key is wrong."""


class OutOfSearches(TravelError):
    """The month's searches on this SerpApi account are used up."""


@dataclass(frozen=True)
class Account:
    plan: str | None
    searches_left: int | None
    searches_per_month: int | None


@dataclass(frozen=True)
class Leg:
    airline: str
    flight_number: str | None
    from_code: str
    from_name: str | None
    departs: datetime | None  # local time at the departure airport, no zone (as Google gives it)
    to_code: str
    to_name: str | None
    arrives: datetime | None  # local time at the arrival airport
    minutes: int | None


@dataclass(frozen=True)
class Flight:
    price: float | None
    minutes: int | None
    stops: int
    airline: str
    airline_logo: str | None
    legs: list[Leg]
    layovers: list[str] = field(default_factory=list)
    best: bool = False

    @property
    def departs(self) -> datetime | None:
        return self.legs[0].departs if self.legs else None

    @property
    def arrives(self) -> datetime | None:
        return self.legs[-1].arrives if self.legs else None


@dataclass(frozen=True)
class FlightResults:
    flights: list[Flight]
    google_url: str | None
    lowest_price: float | None
    price_level: str | None  # "low", "typical", "high"
    typical_range: tuple[float, float] | None


@dataclass(frozen=True)
class Hotel:
    name: str
    kind: str  # "hotel" or "vacation rental"
    stars: int | None
    rating: float | None
    reviews: int | None
    per_night: float | None
    total: float | None
    link: str | None
    image: str | None
    amenities: list[str]
    check_in_time: str | None
    check_out_time: str | None
    latitude: float | None
    longitude: float | None


@dataclass(frozen=True)
class HotelResults:
    hotels: list[Hotel]
    google_url: str | None


def _client() -> httpx.Client:
    return httpx.Client(transport=transport, timeout=40.0)


def _get(path: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        with _client() as client:
            response = client.get(f"{BASE_URL}/{path}", params=params)
    except httpx.HTTPError as exc:
        log.warning("SerpApi unreachable: %s", exc)
        raise TravelError("Couldn't reach SerpApi. Try again in a minute.") from exc
    try:
        data = response.json()
    except ValueError:
        data = {}
    if not isinstance(data, dict):
        data = {}
    message = str(data.get("error") or "")
    if response.status_code == 401 or "invalid api key" in message.lower():
        raise KeyRejected("SerpApi didn't accept that key. Copy it again from your SerpApi dashboard.")
    if response.status_code == 429 or "run out of searches" in message.lower():
        raise OutOfSearches("This month's SerpApi searches are used up. They come back at the start of next month.")
    if response.status_code >= 400:
        log.warning("SerpApi answered %s: %s", response.status_code, message[:200])
        raise TravelError(message[:200] or f"SerpApi answered {response.status_code}.")
    return data


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def _int(value: Any) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


def _local_time(value: Any) -> datetime | None:
    # Google Flights: "2026-12-05 08:30", local time at that airport.
    if not isinstance(value, str):
        return None
    try:
        return datetime.strptime(value.strip(), "%Y-%m-%d %H:%M")
    except ValueError:
        return None


def account(api_key: str) -> Account:
    """Checks the key and how many searches are left this month. Doesn't use a search."""
    data = _get("account.json", {"api_key": api_key})
    return Account(
        plan=str(data["plan_name"]) if data.get("plan_name") else None,
        searches_left=_int(data.get("total_searches_left", data.get("plan_searches_left"))),
        searches_per_month=_int(data.get("searches_per_month")),
    )


def _leg(raw: dict[str, Any]) -> Leg:
    start = raw.get("departure_airport") if isinstance(raw.get("departure_airport"), dict) else {}
    end = raw.get("arrival_airport") if isinstance(raw.get("arrival_airport"), dict) else {}
    return Leg(
        airline=str(raw.get("airline") or ""),
        flight_number=str(raw["flight_number"]) if raw.get("flight_number") else None,
        from_code=str(start.get("id") or ""),
        from_name=str(start["name"]) if start.get("name") else None,
        departs=_local_time(start.get("time")),
        to_code=str(end.get("id") or ""),
        to_name=str(end["name"]) if end.get("name") else None,
        arrives=_local_time(end.get("time")),
        minutes=_int(raw.get("duration")),
    )


def _flight(raw: dict[str, Any], best: bool) -> Flight | None:
    legs = [_leg(leg) for leg in raw.get("flights") or [] if isinstance(leg, dict)]
    if not legs:
        return None
    airlines = list(dict.fromkeys(leg.airline for leg in legs if leg.airline))
    layovers = [
        str(stop.get("id") or stop.get("name"))
        for stop in raw.get("layovers") or []
        if isinstance(stop, dict) and (stop.get("id") or stop.get("name"))
    ]
    return Flight(
        price=_number(raw.get("price")),
        minutes=_int(raw.get("total_duration")),
        stops=len(legs) - 1,
        airline=" + ".join(airlines) or "?",
        airline_logo=str(raw["airline_logo"]) if raw.get("airline_logo") else None,
        legs=legs,
        layovers=layovers,
        best=best,
    )


def flights(
    api_key: str,
    *,
    origin: str,
    destination: str,
    depart_on: date,
    return_on: date | None,
    adults: int = 1,
    cabin: str = "economy",
    stops: str = "any",
    currency: str = "SAR",
    language: str = "en",
) -> FlightResults:
    """One search. For a round trip the prices are for the whole trip, and the legs shown are the way out (Google
    lists the way back once a way out is picked, which would cost a second search)."""
    params: dict[str, Any] = {
        "engine": "google_flights",
        "api_key": api_key,
        "departure_id": origin,
        "arrival_id": destination,
        "outbound_date": depart_on.isoformat(),
        "type": 1 if return_on else 2,
        "adults": adults,
        "travel_class": CABINS.get(cabin, 1),
        "stops": STOPS.get(stops, 0),
        "currency": currency,
        "hl": language,
        "gl": "sa",
    }
    if return_on:
        params["return_date"] = return_on.isoformat()
    data = _get("search.json", params)
    found = [_flight(raw, True) for raw in data.get("best_flights") or [] if isinstance(raw, dict)]
    found += [_flight(raw, False) for raw in data.get("other_flights") or [] if isinstance(raw, dict)]
    insights = data.get("price_insights") if isinstance(data.get("price_insights"), dict) else {}
    span = insights.get("typical_price_range")
    typical = (
        (float(span[0]), float(span[1]))
        if isinstance(span, list) and len(span) == 2 and all(_number(v) is not None for v in span)
        else None
    )
    metadata = data.get("search_metadata") if isinstance(data.get("search_metadata"), dict) else {}
    return FlightResults(
        flights=[flight for flight in found if flight is not None],
        google_url=str(metadata["google_flights_url"]) if metadata.get("google_flights_url") else None,
        lowest_price=_number(insights.get("lowest_price")),
        price_level=str(insights["price_level"]) if insights.get("price_level") else None,
        typical_range=typical,
    )


def _rate(raw: Any) -> float | None:
    return _number(raw.get("extracted_lowest")) if isinstance(raw, dict) else None


def _hotel(raw: dict[str, Any]) -> Hotel | None:
    name = str(raw.get("name") or "").strip()
    if not name:
        return None
    images = [image for image in raw.get("images") or [] if isinstance(image, dict)]
    gps = raw.get("gps_coordinates") if isinstance(raw.get("gps_coordinates"), dict) else {}
    return Hotel(
        name=name,
        kind=str(raw.get("type") or "hotel"),
        stars=_int(raw.get("extracted_hotel_class")),
        rating=_number(raw.get("overall_rating")),
        reviews=_int(raw.get("reviews")),
        per_night=_rate(raw.get("rate_per_night")),
        total=_rate(raw.get("total_rate")),
        link=str(raw["link"]) if raw.get("link") else None,
        image=str(images[0].get("thumbnail")) if images and images[0].get("thumbnail") else None,
        amenities=[str(item) for item in (raw.get("amenities") or [])[:8] if isinstance(item, str)],
        check_in_time=str(raw["check_in_time"]) if raw.get("check_in_time") else None,
        check_out_time=str(raw["check_out_time"]) if raw.get("check_out_time") else None,
        latitude=_number(gps.get("latitude")),
        longitude=_number(gps.get("longitude")),
    )


def hotels(
    api_key: str,
    *,
    place: str,
    check_in: date,
    check_out: date,
    adults: int = 1,
    sort: str = "rating",
    min_stars: int | None = None,
    currency: str = "SAR",
    language: str = "en",
) -> HotelResults:
    """One search: places to stay in or near `place` for those nights."""
    params: dict[str, Any] = {
        "engine": "google_hotels",
        "api_key": api_key,
        "q": place,
        "check_in_date": check_in.isoformat(),
        "check_out_date": check_out.isoformat(),
        "adults": adults,
        "currency": currency,
        "hl": language,
        "gl": "sa",
        "sort_by": HOTEL_SORT.get(sort, 8),
    }
    if min_stars:
        params["hotel_class"] = ",".join(str(stars) for stars in range(min_stars, 6))
    data = _get("search.json", params)
    found = [_hotel(raw) for raw in data.get("properties") or [] if isinstance(raw, dict)]
    metadata = data.get("search_metadata") if isinstance(data.get("search_metadata"), dict) else {}
    return HotelResults(
        hotels=[hotel for hotel in found if hotel is not None],
        google_url=str(metadata["google_hotels_url"]) if metadata.get("google_hotels_url") else None,
    )
