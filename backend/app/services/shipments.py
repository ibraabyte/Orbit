"""The order tracker: follow tracking numbers, find them in shipping emails, and say when one is late or arrived.

- add(): the user types a number. It is registered with their 17TRACK account right away when a key is linked.
- scan_email(): reads recent shipping emails in the linked Gmail (read only), finds tracking numbers in them, and
  adds each new one with the shop's name. Only the number, the shop and the email id are kept.
- refresh(): asks 17TRACK about every shipment still on its way that wasn't checked in the last REFRESH_EVERY.
- flags() / alert(): what needs a look (late, stuck, a delivery problem) and what to announce once (out for delivery,
  ready for pickup, delivered, a problem, late). The app shows an alert and then marks it seen.

find_numbers() is pure, so the email side is tested without Gmail.
"""

import contextlib
import logging
import re
import threading
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import GmailConnection, ServiceConnection, Shipment, ShipmentScan
from app.models.shipments import MAX_EVENTS
from app.security import decrypt_secret
from app.services import gmail_api, tracking_api

log = logging.getLogger("orbit.shipments")

REFRESH_EVERY = timedelta(hours=3)
SCAN_EVERY = timedelta(hours=6)
# How far back the first look through Gmail goes; later looks start a day before the last one.
FIRST_SCAN_DAYS = 21
EMAIL_LIMIT = 60
# No new event for this long while on the way: probably stuck.
STUCK_DAYS = 6
# Still "not found" this long after adding: the number may be wrong, or the shop hasn't handed it over.
NO_INFO_DAYS = 7
# Delivered shipments leave the list on their own after this.
ARCHIVE_AFTER_DAYS = 30

DONE = {"delivered"}
PROBLEMS = {"failed", "exception", "expired"}
ON_THE_WAY = {"info_received", "in_transit", "out_for_delivery", "pickup"}

ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

# Formats that are tracking numbers wherever they appear.
SHAPES = (
    re.compile(r"\b[A-Z]{2}\d{9}[A-Z]{2}\b"),  # UPU (Saudi Post SPL, China Post, most national posts): RR123456789SA
    re.compile(r"\b1Z[0-9A-Z]{16}\b"),  # UPS
    re.compile(r"\bJT\d{12,13}\b"),  # J&T Express
    re.compile(r"\bTBA\d{12}\b"),  # Amazon Logistics
    re.compile(r"\bSPXSA\d{8,14}\b"),  # Shopee Express / SPX
)
# Words that come right before a tracking number. Longest first, so "tracking number" wins over "tracking".
_LEADS = (
    r"tracking\s*(?:number|no\.?|code|id|#)",
    r"track(?:ing)?\s*#",
    r"shipment\s*(?:number|no\.?|#)",
    r"air\s*waybill(?:\s*(?:number|no\.?))?",
    r"waybill(?:\s*(?:number|no\.?))?",
    r"awb(?:\s*(?:number|no\.?|#))?",
    r"consignment\s*(?:number|no\.?)",
    r"رقم\s*(?:التتبع|التتبّع|تتبع|الشحنة|الشحنه|الشحن|البوليصة|البوليصه|بوليصة\s*الشحن)",
    r"بوليصة\s*الشحن",
    r"البوليصة",
    r"tracking",
)
LEADS = re.compile(r"(?:" + "|".join(_LEADS) + r")[\s:：#.\-–—=]{0,6}(?:is\s+|هو\s+)?([A-Z0-9][A-Z0-9\-]{6,34}[A-Z0-9])", re.IGNORECASE)

# Gmail search for shipping emails, English and Arabic.
EMAIL_WORDS = (
    "shipped",
    "shipment",
    '"tracking number"',
    '"out for delivery"',
    '"on its way"',
    '"on the way"',
    "AWB",
    "waybill",
    '"تم شحن"',
    "شحنتك",
    "شحنة",
    '"رقم التتبع"',
    '"في الطريق"',
    '"قيد التوصيل"',
    '"خرج للتوصيل"',
)

# Generic sender names that say nothing about the shop.
_GENERIC_SENDERS = {"no-reply", "noreply", "no reply", "notifications", "notification", "info", "support", "orders", "order", "shipping"}


class NoKey(Exception):
    """No 17TRACK key linked for this user."""


@dataclass(frozen=True)
class Found:
    number: str
    store: str | None
    email_id: str


def clean_number(value: str) -> str:
    return re.sub(r"[\s\-]", "", value.translate(ARABIC_DIGITS)).upper()


def looks_like_number(value: str) -> bool:
    """5 to 40 letters and digits, mostly digits, not one digit repeated."""
    if not re.fullmatch(r"[A-Z0-9]{5,40}", value):
        return False
    digits = sum(ch.isdigit() for ch in value)
    return digits >= 6 and digits * 2 >= len(value) and len(set(value)) > 2


def find_numbers(text: str) -> list[str]:
    """Tracking numbers in an email's subject and text, in the order they appear, each once."""
    text = text.translate(ARABIC_DIGITS)
    found: list[tuple[int, str]] = []
    for shape in SHAPES:
        found.extend((m.start(), m.group(0)) for m in shape.finditer(text))
    for m in LEADS.finditer(text):
        candidate = clean_number(m.group(1))
        if looks_like_number(candidate):
            found.append((m.start(1), candidate))
    seen: set[str] = set()
    numbers: list[str] = []
    for _, number in sorted(found):
        number = clean_number(number)
        if number not in seen:
            seen.add(number)
            numbers.append(number)
    return numbers


def store_name(sender_name: str, sender_domain: str) -> str | None:
    name = re.sub(r"\s+", " ", sender_name).strip(" \"'")
    if name and name.lower() not in _GENERIC_SENDERS and "@" not in name:
        return name[:80]
    labels = [
        p
        for p in sender_domain.split(".")
        if p and p not in {"com", "sa", "net", "org", "co", "ae", "mail", "email", "info", "news", "e", "em"}
    ]
    return labels[-1].capitalize()[:80] if labels else None


def gmail_query(since: datetime | None) -> str:
    when = f"after:{int(since.timestamp())}" if since else f"newer_than:{FIRST_SCAN_DAYS}d"
    return f"{when} ({' OR '.join(EMAIL_WORDS)})"


def emails_found(mails: Iterable[tuple[gmail_api.MailHeader, str]]) -> list[Found]:
    """Each tracking number in these emails once, with the shop that sent the first email about it."""
    found: dict[str, Found] = {}
    # Oldest first, so a shipment keeps the email that first announced it.
    for header, body in sorted(mails, key=lambda item: item[0].sent_at):
        for number in find_numbers(f"{header.subject}\n{header.snippet}\n{body}")[:3]:
            if number not in found:
                found[number] = Found(number=number, store=store_name(header.sender_name, header.sender_domain), email_id=header.id)
    return list(found.values())


# --- state ------------------------------------------------------------------------------------------------------


def flags(row: Shipment, today: date, now: datetime | None = None) -> list[str]:
    """What needs a look: late (past the expected day), stuck (no news for days), problem, no_info."""
    if row.status in DONE or row.archived:
        return []
    now = now or datetime.now(UTC)
    found: list[str] = []
    if row.status in PROBLEMS:
        found.append("problem")
    if row.eta_on and row.eta_on < today:
        found.append("late")
    elif row.eta_on is None and row.status in ON_THE_WAY and row.last_event_at and now - row.last_event_at >= timedelta(days=STUCK_DAYS):
        found.append("stuck")
    if row.status in {"not_found", "pending"} and row.registered and now - row.created_at >= timedelta(days=NO_INFO_DAYS):
        found.append("no_info")
    return found


def alert(row: Shipment, today: date, now: datetime | None = None) -> str | None:
    """The one thing worth announcing about this shipment right now, if any."""
    if row.archived:
        return None
    if row.status == "delivered":
        return "delivered"
    if row.status in PROBLEMS:
        return "problem"
    if row.status == "out_for_delivery":
        return "out_for_delivery"
    if row.status == "pickup":
        return "pickup"
    if {"late", "stuck"} & set(flags(row, today, now)):
        return "late"
    return None


def pending_alert(row: Shipment, today: date, now: datetime | None = None) -> str | None:
    current = alert(row, today, now)
    return current if current and current != row.alert_seen else None


# --- 17TRACK ----------------------------------------------------------------------------------------------------


def api_key(db: Session, user_id: uuid.UUID) -> str:
    connection = db.get(ServiceConnection, (user_id, tracking_api.PROVIDER))
    key = decrypt_secret(connection.api_key) if connection else None
    if not key:
        raise NoKey
    return key


def _state(db: Session, user_id: uuid.UUID) -> ShipmentScan:
    state = db.get(ShipmentScan, user_id)
    if state is None:
        state = ShipmentScan(user_id=user_id, emails_read=0)
        db.add(state)
    return state


def apply(row: Shipment, info: tracking_api.TrackInfo, now: datetime) -> None:
    first_answer = row.checked_at is None
    row.status = info.status
    row.sub_status = info.sub_status
    if info.carrier_code:
        row.carrier_code = info.carrier_code
    if info.carrier_name:
        row.carrier_name = info.carrier_name
    if info.eta_on:
        row.eta_on = info.eta_on
    row.events = [event.as_json() for event in info.events[:MAX_EVENTS]]
    latest = info.latest
    if latest:
        row.last_event = latest.text
        row.last_location = latest.place
        row.last_event_at = latest.at
    if info.status == "delivered" and row.delivered_at is None:
        row.delivered_at = (latest.at if latest and latest.at else None) or now
    if info.status != "delivered":
        row.delivered_at = None
    row.error = None
    # Something that was already delivered before Orbit first heard about it isn't news.
    if first_answer and info.status == "delivered":
        row.alert_seen = "delivered"


def _chunks(rows: list[Shipment], size: int = tracking_api.BATCH) -> Iterable[list[Shipment]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def refresh(db: Session, user_id: uuid.UUID, force: bool = False, only: list[Shipment] | None = None) -> int:
    """Asks 17TRACK about shipments still on their way. Returns how many were checked. Commits."""
    key = api_key(db, user_id)
    now = datetime.now(UTC)
    state = _state(db, user_id)
    rows = only
    if rows is None:
        rows = list(db.scalars(select(Shipment).where(Shipment.user_id == user_id, Shipment.archived.is_(False))))
    # Delivered ones leave the list after a while, and aren't asked about again.
    for row in rows:
        if row.status == "delivered" and row.delivered_at and now - row.delivered_at > timedelta(days=ARCHIVE_AFTER_DAYS):
            row.archived = True
    due = [
        r
        for r in rows
        if not r.archived and r.status != "delivered" and (force or r.checked_at is None or now - r.checked_at >= REFRESH_EVERY)
    ]
    try:
        for batch in _chunks([r for r in due if not r.registered]):
            accepted, rejected = tracking_api.register(key, [(r.number, r.carrier_code) for r in batch])
            for row in batch:
                if row.number in accepted:
                    row.registered = True
                elif row.number in rejected:
                    row.error = rejected[row.number]
        for batch in _chunks([r for r in due if r.registered]):
            infos, missing = tracking_api.track_info(key, [(r.number, r.carrier_code) for r in batch])
            for row in batch:
                if row.number in infos:
                    apply(row, infos[row.number], now)
                elif missing.get(row.number) == tracking_api.NOT_REGISTERED:
                    # Removed on 17TRACK's side: register it again next time.
                    row.registered = False
                row.checked_at = now
        state.tracking_error = None
    except tracking_api.TrackingError as exc:
        state.tracking_error = str(exc)
        db.commit()
        raise
    state.refreshed_at = now
    db.commit()
    return len(due)


def add(db: Session, user_id: uuid.UUID, number: str, label: str | None = None, store: str | None = None) -> Shipment:
    """A new shipment, asked about right away when a 17TRACK key is linked. Raises ValueError for a bad number."""
    cleaned = clean_number(number)
    if not re.fullmatch(r"[A-Z0-9]{5,40}", cleaned):
        raise ValueError("That doesn't look like a tracking number.")
    existing = db.scalar(select(Shipment).where(Shipment.user_id == user_id, Shipment.number == cleaned))
    if existing is not None:
        if not existing.archived:
            raise LookupError("You're already following this shipment.")
        existing.archived = False
        existing.label = label or existing.label
        db.commit()
        return existing
    row = Shipment(user_id=user_id, number=cleaned, label=label, store=store, source="manual", status="pending", events=[])
    db.add(row)
    db.commit()
    db.refresh(row)
    _try_refresh(db, user_id, [row])
    return row


def _try_refresh(db: Session, user_id: uuid.UUID, rows: list[Shipment]) -> None:
    if not rows:
        return
    try:
        refresh(db, user_id, force=True, only=rows)
    except NoKey:
        pass
    except tracking_api.TrackingError as exc:
        log.info("17TRACK didn't answer for new shipments: %s", exc.__class__.__name__)
    for row in rows:
        db.refresh(row)


def scan_email(db: Session, user_id: uuid.UUID) -> list[Shipment]:
    """Adds the tracking numbers in recent shipping emails. Returns the new shipments. Commits."""
    state = _state(db, user_id)
    since = state.scanned_at - timedelta(days=1) if state.scanned_at else None
    added: list[Shipment] = []
    try:
        access = gmail_api.access_token(db, user_id)
        ids = gmail_api.search(access, gmail_query(since), EMAIL_LIMIT)
        known_emails = set(db.scalars(select(Shipment.email_id).where(Shipment.user_id == user_id, Shipment.email_id.is_not(None))))
        mails = gmail_api.messages_with_text(access, [i for i in ids if i not in known_emails])
    except gmail_api.NotConnected:
        raise
    except gmail_api.GmailError as exc:
        state.email_error = str(exc)
        connection = db.get(GmailConnection, user_id)
        if connection is not None:
            connection.last_error = state.email_error
        db.commit()
        raise
    known = set(db.scalars(select(Shipment.number).where(Shipment.user_id == user_id)))
    for found in emails_found(mails):
        if found.number in known:
            continue
        row = Shipment(
            user_id=user_id, number=found.number, store=found.store, source="email", email_id=found.email_id, status="pending", events=[]
        )
        db.add(row)
        added.append(row)
        known.add(found.number)
    state.scanned_at = datetime.now(UTC)
    state.emails_read = len(mails)
    state.email_error = None
    connection = db.get(GmailConnection, user_id)
    if connection is not None and mails:
        connection.last_error = None
    db.commit()
    _try_refresh(db, user_id, added)
    return added


def update_all(db: Session, user_id: uuid.UUID, force: bool = False) -> None:
    """What the refresh button and the background job do: look through Gmail when it's time, then ask 17TRACK."""
    state = db.get(ShipmentScan, user_id)
    now = datetime.now(UTC)
    if db.get(GmailConnection, user_id) is not None and (
        force or state is None or state.scanned_at is None or now - state.scanned_at >= SCAN_EVERY
    ):
        with contextlib.suppress(gmail_api.NotConnected, gmail_api.GmailError):
            scan_email(db, user_id)
    with contextlib.suppress(NoKey, tracking_api.TrackingError):
        refresh(db, user_id, force=force)


def users_to_update(db: Session) -> list[uuid.UUID]:
    return list(db.scalars(select(ServiceConnection.user_id).where(ServiceConnection.provider == tracking_api.PROVIDER)))


def update_due() -> int:
    """One round of the background job: every user with a 17TRACK key, each in its own session."""
    from app.db import get_sessionmaker

    done = 0
    with get_sessionmaker()() as db:
        users = users_to_update(db)
    for user_id in users:
        with get_sessionmaker()() as db:
            try:
                update_all(db, user_id)
                done += 1
            except Exception:  # noqa: BLE001 - one account's failure must not stop the others
                log.exception("Shipment update failed for one account")
    return done


class Scheduler:
    """A daemon thread in the API process, like the WHOOP sync. Each shipment's checked_at keeps the work from repeating."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        minutes = get_settings().shipments_sync_minutes
        if minutes <= 0:
            return
        self._thread = threading.Thread(target=self._run, args=(minutes * 60.0,), name="shipments-sync", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self, every: float) -> None:
        # Start a few minutes after a deploy, after WHOOP's first round.
        wait = 180.0
        while not self._stop.wait(wait):
            try:
                update_due()
            except Exception:  # noqa: BLE001 - a crash here would silently end background updates
                log.exception("Shipment background update failed")
            wait = every


scheduler = Scheduler()
