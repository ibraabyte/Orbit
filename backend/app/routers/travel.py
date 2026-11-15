"""The travel assistant: give a place and dates, see flight and hotel options from Google, and put the trip in Tasks.

GET /travel says whether the user's SerpApi key is linked and lists the airports to pick from. PUT and DELETE
/travel/key link and unlink the key (stored encrypted, never sent back). POST /travel/flights and /travel/hotels each
use one search on the user's SerpApi account. POST /travel/trips turns the picks into a task list. Nothing is booked
or paid here; each option links to Google to book.
"""

import uuid
from datetime import date, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.deps import Db, UserId
from app.models import ServiceConnection
from app.routers.plan import user_today
from app.security import decrypt_secret, encrypt_secret
from app.services import airports, travel_api, trip_plan

router = APIRouter(prefix="/travel", tags=["travel"])

Language = Literal["en", "ar"]
Currency = Literal["SAR", "AED", "KWD", "QAR", "BHD", "OMR", "USD", "EUR", "GBP"]
Iata = Annotated[str, StringConstraints(min_length=3, max_length=3, pattern=r"^[A-Za-z]{3}$")]
# Google lists fares about 11 months out.
MAX_DAYS_AHEAD = 335
MAX_NIGHTS = 30


class AirportRow(BaseModel):
    code: str
    city: str
    city_ar: str
    country: str


class KeyStatus(BaseModel):
    connected: bool
    connected_at: datetime | None = None


class Overview(BaseModel):
    key: KeyStatus
    airports: list[AirportRow]
    signup_url: str


class KeyConnect(BaseModel):
    api_key: str = Field(min_length=20, max_length=200)


class KeyConnected(KeyStatus):
    plan: str | None = None
    searches_left: int | None = None


def _check_dates(depart_on: date, back_on: date | None, today: date) -> None:
    if depart_on < today:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The day out has passed.")
    if depart_on > today + timedelta(days=MAX_DAYS_AHEAD):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That's too far ahead; Google lists fares about 11 months out.")
    if back_on is not None and back_on < depart_on:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The day back is before the day out.")


class FlightSearch(BaseModel):
    origin: Iata
    destination: Iata
    depart_on: date
    return_on: date | None = None
    adults: int = Field(default=1, ge=1, le=9)
    cabin: Literal["economy", "premium", "business", "first"] = "economy"
    stops: Literal["any", "nonstop", "one"] = "any"
    currency: Currency = "SAR"
    language: Language = "en"

    @model_validator(mode="after")
    def _different(self) -> "FlightSearch":
        self.origin, self.destination = self.origin.upper(), self.destination.upper()
        if self.origin == self.destination:
            raise ValueError("Pick two different airports.")
        return self


class LegOut(BaseModel):
    airline: str
    flight_number: str | None
    from_code: str
    from_name: str | None
    departs: datetime | None
    to_code: str
    to_name: str | None
    arrives: datetime | None
    minutes: int | None


class FlightOut(BaseModel):
    price: float | None
    minutes: int | None
    stops: int
    airline: str
    airline_logo: str | None
    legs: list[LegOut]
    layovers: list[str]
    best: bool
    departs: datetime | None
    arrives: datetime | None


class FlightsOut(BaseModel):
    flights: list[FlightOut]
    google_url: str | None
    lowest_price: float | None
    price_level: str | None
    typical_range: tuple[float, float] | None
    currency: str


class HotelSearch(BaseModel):
    place: str = Field(min_length=2, max_length=120)
    check_in: date
    check_out: date
    adults: int = Field(default=1, ge=1, le=9)
    sort: Literal["rating", "price"] = "rating"
    min_stars: int | None = Field(default=None, ge=2, le=5)
    currency: Currency = "SAR"
    language: Language = "en"

    @model_validator(mode="after")
    def _nights(self) -> "HotelSearch":
        nights = (self.check_out - self.check_in).days
        if nights < 1:
            raise ValueError("Check-out must be after check-in.")
        if nights > MAX_NIGHTS:
            raise ValueError(f"Search at most {MAX_NIGHTS} nights at a time.")
        return self


class HotelOut(BaseModel):
    name: str
    kind: str
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


class HotelsOut(BaseModel):
    hotels: list[HotelOut]
    google_url: str | None
    currency: str


class PickedFlightIn(BaseModel):
    airline: str = Field(min_length=1, max_length=120)
    flight_numbers: list[str] = Field(default_factory=list, max_length=6)
    from_code: Iata
    to_code: Iata
    departs: datetime | None = None
    price: float | None = Field(default=None, ge=0)
    stops: int = Field(default=0, ge=0, le=6)


class PickedHotelIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    per_night: float | None = Field(default=None, ge=0)
    total: float | None = Field(default=None, ge=0)
    link: str | None = Field(default=None, max_length=2000, pattern=r"^https://")


class TripIn(BaseModel):
    place: str = Field(min_length=2, max_length=40)
    origin: Iata | None = None
    destination: Iata | None = None
    depart_on: date
    return_on: date | None = None
    currency: Currency = "SAR"
    flight: PickedFlightIn | None = None
    hotel: PickedHotelIn | None = None
    flights_url: str | None = Field(default=None, max_length=4000, pattern=r"^https://")
    language: Language = "en"


class TripOut(BaseModel):
    list_id: uuid.UUID
    list_name: str
    tasks: int
    passport_warning: bool


def _connection(db: Db, user_id: uuid.UUID) -> ServiceConnection | None:
    return db.get(ServiceConnection, (user_id, travel_api.PROVIDER))


def _key_status(row: ServiceConnection | None) -> KeyStatus:
    return KeyStatus(connected=row is not None, connected_at=row.created_at if row else None)


def _api_key(db: Db, user_id: uuid.UUID) -> str:
    row = _connection(db, user_id)
    key = decrypt_secret(row.api_key) if row else None
    if not key:
        raise HTTPException(status.HTTP_409_CONFLICT, "Link your SerpApi key first.")
    return key


def _failure(exc: travel_api.TravelError) -> HTTPException:
    if isinstance(exc, travel_api.KeyRejected):
        return HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))
    if isinstance(exc, travel_api.OutOfSearches):
        return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, str(exc))
    return HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc))


@router.get("", response_model=Overview)
def overview(user_id: UserId, db: Db):
    rows = [AirportRow(code=a.code, city=a.city, city_ar=a.city_ar, country=a.country) for a in airports.AIRPORTS.values()]
    return Overview(key=_key_status(_connection(db, user_id)), airports=rows, signup_url=travel_api.SIGNUP_URL)


@router.put("/key", response_model=KeyConnected)
def connect_key(body: KeyConnect, user_id: UserId, db: Db):
    """Checks the key with SerpApi (free, uses no search), then keeps it encrypted."""
    key = body.api_key.strip()
    try:
        found = travel_api.account(key)
    except travel_api.TravelError as exc:
        raise _failure(exc) from exc
    row = _connection(db, user_id)
    if row is None:
        row = ServiceConnection(user_id=user_id, provider=travel_api.PROVIDER, url=travel_api.BASE_URL, api_key="")
        db.add(row)
    row.api_key = encrypt_secret(key)
    row.account_name = found.plan
    db.commit()
    db.refresh(row)
    return KeyConnected(**_key_status(row).model_dump(), plan=found.plan, searches_left=found.searches_left)


@router.delete("/key", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_key(user_id: UserId, db: Db):
    row = _connection(db, user_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/flights", response_model=FlightsOut)
def search_flights(body: FlightSearch, user_id: UserId, db: Db):
    _check_dates(body.depart_on, body.return_on, user_today(db, user_id))
    key = _api_key(db, user_id)
    try:
        found = travel_api.flights(
            key,
            origin=body.origin,
            destination=body.destination,
            depart_on=body.depart_on,
            return_on=body.return_on,
            adults=body.adults,
            cabin=body.cabin,
            stops=body.stops,
            currency=body.currency,
            language=body.language,
        )
    except travel_api.TravelError as exc:
        raise _failure(exc) from exc
    flights = [
        FlightOut(
            price=f.price,
            minutes=f.minutes,
            stops=f.stops,
            airline=f.airline,
            airline_logo=f.airline_logo,
            legs=[LegOut(**vars(leg)) for leg in f.legs],
            layovers=f.layovers,
            best=f.best,
            departs=f.departs,
            arrives=f.arrives,
        )
        for f in found.flights[:12]
    ]
    return FlightsOut(
        flights=flights,
        google_url=found.google_url,
        lowest_price=found.lowest_price,
        price_level=found.price_level,
        typical_range=found.typical_range,
        currency=body.currency,
    )


@router.post("/hotels", response_model=HotelsOut)
def search_hotels(body: HotelSearch, user_id: UserId, db: Db):
    _check_dates(body.check_in, body.check_out, user_today(db, user_id))
    key = _api_key(db, user_id)
    try:
        found = travel_api.hotels(
            key,
            place=body.place.strip(),
            check_in=body.check_in,
            check_out=body.check_out,
            adults=body.adults,
            sort=body.sort,
            min_stars=body.min_stars,
            currency=body.currency,
            language=body.language,
        )
    except travel_api.TravelError as exc:
        raise _failure(exc) from exc
    return HotelsOut(hotels=[HotelOut(**vars(h)) for h in found.hotels[:12]], google_url=found.google_url, currency=body.currency)


@router.post("/trips", response_model=TripOut, status_code=status.HTTP_201_CREATED)
def add_trip(body: TripIn, user_id: UserId, db: Db):
    """Puts the trip in Tasks: its own list, with the bookings, the passport, packing, check-in and leaving."""
    _check_dates(body.depart_on, body.return_on, user_today(db, user_id))
    flight = body.flight
    trip = trip_plan.Trip(
        place=body.place.strip(),
        origin=body.origin.upper() if body.origin else None,
        destination=body.destination.upper() if body.destination else None,
        depart_on=body.depart_on,
        return_on=body.return_on,
        currency=body.currency,
        flight=trip_plan.PickedFlight(
            airline=flight.airline,
            flight_numbers=[number[:12] for number in flight.flight_numbers],
            from_code=flight.from_code.upper(),
            to_code=flight.to_code.upper(),
            # The local time at the airport, as the search gave it.
            departs=flight.departs.replace(tzinfo=None) if flight.departs else None,
            price=flight.price,
            stops=flight.stops,
        )
        if flight
        else None,
        hotel=trip_plan.PickedHotel(**body.hotel.model_dump()) if body.hotel else None,
        flights_url=body.flights_url,
        language=body.language,
    )
    planned = trip_plan.plan(db, user_id, trip)
    db.commit()
    return TripOut(
        list_id=planned.list.id, list_name=planned.list.name, tasks=len(planned.tasks), passport_warning=planned.passport_warning
    )
