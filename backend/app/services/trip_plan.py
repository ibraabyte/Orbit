"""Turns a trip into tasks: a list of its own, with booking the flight and the hotel, a passport check, packing, online
check-in and the time to leave for the airport. Nothing is booked; the booking tasks carry Google's link.

The trip's list is named after the place and the day out ("Trip to Dubai, 5 Dec"), so two trips to the same city stay
apart. Due times are in the user's own time zone; check-in and leaving for the airport follow the flight's departure in
the departure airport's zone.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Document, Profile, Task, TaskList
from app.services import airports
from app.services.tasks import add_steps, ensure_list, reminder_for

# Many countries want the passport valid this long after you arrive.
PASSPORT_MONTHS = 6
# How early to be at the airport for an international flight, and when airlines open online check-in.
AIRPORT_HOURS = 3
CHECK_IN_HOURS = 24
# Book within a few days, and never later than two weeks before (prices climb).
BOOK_WITHIN_DAYS = 3
BOOK_BEFORE_DAYS = 14

MONTHS_EN = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
MONTHS_AR = ("يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر")

TEXT = {
    "en": {
        "list": "Trip to {place}, {day}",
        "book_flight": "Book the flight: {what}",
        "book_flight_any": "Book the flight to {place}",
        "book_hotel": "Book the hotel: {what}",
        "book_hotel_any": "Book a place to stay in {place}",
        "passport_renew": "Renew your passport before the trip",
        "passport_renew_notes": "It expires on {expires}. Many countries want it valid {months} months after you arrive.",
        "passport_check": "Check your passport is valid for the trip",
        "passport_check_notes": (
            "Many countries want it valid {months} months after you arrive. Add it under Documents and Orbit will keep an eye on it."
        ),
        "visa": "Check if you need a visa for {place}",
        "pack": "Pack for {place}",
        "check_in": "Check in online: {what}",
        "leave": "Leave for the airport ({code})",
        "leave_notes": "The flight leaves at {time}. Be there {hours} hours early.",
        "price": "{price} {currency}",
        "per_night": "{price} {currency} a night",
        "total": "{price} {currency} in all",
        "open_google": "Book on Google: {url}",
        "steps_pack": ["Passport and ID", "Phone charger and adapter", "Medicines", "Clothes for {nights} nights", "Cash or a travel card"],
        "steps_flight": ["Compare the price on the airline's site", "Book and save the ticket", "Add the booking number to the notes"],
        "steps_hotel": ["Check the cancellation rules", "Book and save the confirmation"],
    },
    "ar": {
        "list": "رحلة {place}، {day}",
        "book_flight": "احجز الطيران: {what}",
        "book_flight_any": "احجز الطيران إلى {place}",
        "book_hotel": "احجز الفندق: {what}",
        "book_hotel_any": "احجز مكان سكن في {place}",
        "passport_renew": "جدد جوازك قبل السفر",
        "passport_renew_notes": "ينتهي في {expires}. دول كثيرة تطلب الجواز صالح {months} أشهر بعد الوصول.",
        "passport_check": "تأكد إن جوازك صالح للسفر",
        "passport_check_notes": "دول كثيرة تطلب الجواز صالح {months} أشهر بعد الوصول. أضفه في الوثائق وOrbit ينبهك قبل ينتهي.",
        "visa": "تأكد هل تحتاج تأشيرة لـ{place}",
        "pack": "جهّز شنطة {place}",
        "check_in": "سجّل دخول الرحلة أونلاين: {what}",
        "leave": "اطلع للمطار ({code})",
        "leave_notes": "الرحلة تقلع الساعة {time}. خلك هناك قبلها بـ{hours} ساعات.",
        "price": "{price} {currency}",
        "per_night": "{price} {currency} لليلة",
        "total": "{price} {currency} للكل",
        "open_google": "احجز من قوقل: {url}",
        "steps_pack": ["الجواز والهوية", "شاحن الجوال والمحوّل", "الأدوية", "ملابس لـ{nights} ليالي", "كاش أو بطاقة سفر"],
        "steps_flight": ["قارن السعر في موقع شركة الطيران", "احجز واحفظ التذكرة", "اكتب رقم الحجز في الملاحظات"],
        "steps_hotel": ["شوف شروط الإلغاء", "احجز واحفظ التأكيد"],
    },
}


@dataclass(frozen=True)
class PickedFlight:
    airline: str
    flight_numbers: list[str]
    from_code: str
    to_code: str
    departs: datetime | None  # local time at from_code
    price: float | None
    stops: int = 0


@dataclass(frozen=True)
class PickedHotel:
    name: str
    per_night: float | None = None
    total: float | None = None
    link: str | None = None


@dataclass(frozen=True)
class Trip:
    place: str
    origin: str | None
    destination: str | None
    depart_on: date
    return_on: date | None
    currency: str = "SAR"
    flight: PickedFlight | None = None
    hotel: PickedHotel | None = None
    flights_url: str | None = None
    language: str = "en"


@dataclass
class Planned:
    list: TaskList
    tasks: list[Task] = field(default_factory=list)
    passport_warning: bool = False


def _zone(db: Session, user_id: uuid.UUID) -> ZoneInfo:
    profile = db.get(Profile, user_id)
    try:
        return ZoneInfo(profile.timezone) if profile and profile.timezone else ZoneInfo("UTC")
    except (KeyError, ValueError):
        return ZoneInfo("UTC")


def _day(value: date, language: str) -> str:
    months = MONTHS_AR if language == "ar" else MONTHS_EN
    return f"{value.day} {months[value.month - 1]}"


def _long_day(value: date, language: str) -> str:
    return f"{_day(value, language)} {value.year}"


def _money(value: float) -> str:
    return f"{value:,.0f}"


def _months_after(value: date, months: int) -> date:
    month = value.month - 1 + months
    year, month = value.year + month // 12, month % 12 + 1
    for day in (value.day, 30, 29, 28):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    return date(year, month, 28)


def flight_label(flight: PickedFlight) -> str:
    numbers = ", ".join(flight.flight_numbers[:3])
    route = f"{flight.from_code} → {flight.to_code}"
    return " · ".join(part for part in (flight.airline, numbers, route) if part)


def departure_utc(flight: PickedFlight) -> datetime | None:
    """The flight's local departure time as a moment, using the departure airport's zone (None if unknown)."""
    airport = airports.find(flight.from_code)
    if flight.departs is None or airport is None:
        return None
    return flight.departs.replace(tzinfo=ZoneInfo(airport.tz)).astimezone(UTC)


def plan(db: Session, user_id: uuid.UUID, trip: Trip, now: datetime | None = None) -> Planned:
    """Makes the trip's list and tasks in one go (the caller commits)."""
    words = TEXT.get(trip.language, TEXT["en"])
    language = trip.language if trip.language in TEXT else "en"
    zone = _zone(db, user_id)
    now = (now or datetime.now(UTC)).astimezone(zone)
    today = now.date()

    def at(day: date, hour: int) -> datetime:
        return datetime.combine(day, time(hour), zone).astimezone(UTC)

    name = words["list"].format(place=trip.place, day=_day(trip.depart_on, language))[:60]
    trip_list = ensure_list(db, user_id, name)
    done = Planned(list=trip_list)

    def add(
        title: str,
        due: datetime | None,
        *,
        notes: str | None = None,
        priority: str = "normal",
        steps: list[str] | None = None,
        remind: bool = True,
    ) -> Task:
        task = Task(
            user_id=user_id,
            title=title[:220],
            notes=notes,
            priority=priority,
            due_at=due,
            reminder_at=due if remind and due and due > now else None,
            list_id=trip_list.id,
        )
        db.add(task)
        db.flush()
        if steps:
            add_steps(db, task, steps)
        if reminder := reminder_for(task):
            db.add(reminder)
        done.tasks.append(task)
        return task

    book_by = max(today, min(today + timedelta(days=BOOK_WITHIN_DAYS), trip.depart_on - timedelta(days=BOOK_BEFORE_DAYS)))
    book_due = at(book_by, 21)

    # Booking the flight, with what was picked and Google's link.
    if trip.flight:
        what = flight_label(trip.flight)
        lines = [words["price"].format(price=_money(trip.flight.price), currency=trip.currency)] if trip.flight.price else []
        if trip.flights_url:
            lines.append(words["open_google"].format(url=trip.flights_url))
        add(words["book_flight"].format(what=what), book_due, notes="\n".join(lines) or None, priority="high", steps=words["steps_flight"])
    elif trip.flights_url or trip.origin:
        notes = words["open_google"].format(url=trip.flights_url) if trip.flights_url else None
        add(words["book_flight_any"].format(place=trip.place), book_due, notes=notes, priority="high", steps=words["steps_flight"])

    # Booking the hotel.
    if trip.hotel:
        lines = []
        if trip.hotel.per_night:
            lines.append(words["per_night"].format(price=_money(trip.hotel.per_night), currency=trip.currency))
        if trip.hotel.total:
            lines.append(words["total"].format(price=_money(trip.hotel.total), currency=trip.currency))
        if trip.hotel.link:
            lines.append(trip.hotel.link)
        add(
            words["book_hotel"].format(what=trip.hotel.name),
            book_due,
            notes="\n".join(lines) or None,
            priority="high",
            steps=words["steps_hotel"],
        )
    elif trip.return_on:
        add(words["book_hotel_any"].format(place=trip.place), book_due, priority="high", steps=words["steps_hotel"])

    # The passport: from Documents when it is there (the user's own, not a family member's).
    passport = db.scalar(
        select(Document)
        .where(Document.user_id == user_id, Document.kind == "passport", Document.holder.is_(None))
        .order_by(Document.expires_on.desc())
        .limit(1)
    )
    needed_until = _months_after(trip.return_on or trip.depart_on, PASSPORT_MONTHS)
    if passport is not None and passport.expires_on < needed_until:
        done.passport_warning = True
        notes = words["passport_renew_notes"].format(expires=_long_day(passport.expires_on, language), months=PASSPORT_MONTHS)
        add(words["passport_renew"], at(today, 21) if today < trip.depart_on else None, notes=notes, priority="high")
    elif passport is None:
        notes = words["passport_check_notes"].format(months=PASSPORT_MONTHS)
        add(words["passport_check"], book_due, notes=notes)

    # A visa check for anywhere outside the country you leave from.
    home = airports.find(trip.origin or "")
    away = airports.find(trip.destination or "")
    if not (home and away and home.country == away.country):
        add(words["visa"].format(place=trip.place), book_due)

    # Packing, the evening before.
    nights = max(1, (trip.return_on - trip.depart_on).days) if trip.return_on else 3
    pack_steps = [step.format(nights=nights) for step in words["steps_pack"]]
    add(words["pack"].format(place=trip.place), at(max(today, trip.depart_on - timedelta(days=1)), 20), steps=pack_steps)

    # Check-in and leaving for the airport follow the flight's own time.
    leaves = departure_utc(trip.flight) if trip.flight else None
    if trip.flight and leaves:
        add(words["check_in"].format(what=flight_label(trip.flight)), leaves - timedelta(hours=CHECK_IN_HOURS))
        local = trip.flight.departs.strftime("%H:%M") if trip.flight.departs else ""
        add(
            words["leave"].format(code=trip.flight.from_code),
            leaves - timedelta(hours=AIRPORT_HOURS),
            notes=words["leave_notes"].format(time=local, hours=AIRPORT_HOURS),
            priority="high",
        )

    return done
