"""The subscription hunter: finds recurring charges in expenses, bank SMS and (when linked) Gmail receipts.

detect() is pure (charges in, finds out) so it is tested without a database. scan() reads the user's data, runs it,
and saves the finds while keeping what the user already decided about each one.

What makes a find:
- A known service (the catalogue below) charged at least once in the last months, or
- any other merchant charged at regular gaps (weekly, monthly, yearly) with about the same amount, or
- an email that says it is a subscription or a renewal, with an amount.

What needs a look (flags): untracked (not in your bills), price_up, trial_ending (an email says a free trial ends),
duplicate (two of the same sort, like two video services), charged_after_cancel.
"""

import re
import statistics
import uuid
from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any
from urllib.parse import quote_plus

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import BankTransaction, Bill, Expense, GmailConnection, SubscriptionFind, SubscriptionScan
from app.services import gmail_api

LOOKBACK_DAYS = 400
EMAIL_LIMIT = 250
TRIAL_WINDOW_DAYS = 21
# How long after the expected charge a subscription still counts as running.
GRACE = {"weekly": 14, "monthly": 45, "yearly": 400}
PER_MONTH = {"weekly": Decimal("52") / Decimal("12"), "monthly": Decimal("1"), "yearly": Decimal("1") / Decimal("12")}
# Kinds where having two at once is worth a question.
OVERLAP_KINDS = {"video", "music", "cloud", "ai", "delivery"}


@dataclass(frozen=True)
class Service:
    key: str
    name: str
    kind: str
    # Lowercase words or bits that show up in card statements, SMS or Arabic names.
    aliases: tuple[str, ...]
    domains: tuple[str, ...] = ()
    cancel_url: str | None = None


CATALOG: tuple[Service, ...] = (
    Service("netflix", "Netflix", "video", ("netflix", "نتفلكس", "نتفليكس"), ("netflix.com",), "https://www.netflix.com/cancelplan"),
    Service("shahid", "Shahid", "video", ("shahid", "شاهد"), ("shahid.net", "mbc.net")),
    Service("osn", "OSN+", "video", ("osn",), ("osnplus.com", "osn.com")),
    Service("starzplay", "STARZPLAY", "video", ("starzplay", "starz play"), ("starzplay.com",)),
    Service("disney", "Disney+", "video", ("disney",), ("disneyplus.com",), "https://www.disneyplus.com/account"),
    Service("youtube", "YouTube Premium", "video", ("youtube", "يوتيوب"), ("youtube.com",), "https://www.youtube.com/paid_memberships"),
    Service(
        "primevideo",
        "Amazon Prime",
        "delivery",
        ("amazon prime", "prime video", "amzn prime", "primevideo"),
        (),
        "https://www.amazon.sa/gp/primecentral",
    ),
    Service("stctv", "stc tv", "video", ("stc tv", "stctv", "jawwy tv"), ("stctv.com",)),
    Service("spotify", "Spotify", "music", ("spotify", "سبوتيفاي"), ("spotify.com",), "https://www.spotify.com/account/subscription/"),
    Service("anghami", "Anghami", "music", ("anghami", "أنغامي", "انغامي"), ("anghami.com",)),
    Service("applemusic", "Apple Music", "music", ("apple music",), ()),
    Service("deezer", "Deezer", "music", ("deezer",), ("deezer.com",)),
    # Apple bills every App Store and iCloud subscription as one merchant; the app opens the list to pick from.
    Service(
        "apple",
        "Apple (App Store, iCloud)",
        "cloud",
        ("apple.com/bill", "apple com bill", "itunes", "icloud", "apple services"),
        ("apple.com", "email.apple.com"),
        "https://apps.apple.com/account/subscriptions",
    ),
    Service(
        "googleplay",
        "Google Play",
        "apps",
        ("google play", "google *", "googleplay"),
        ("google.com",),
        "https://play.google.com/store/account/subscriptions",
    ),
    Service("googleone", "Google One", "cloud", ("google one", "google storage"), (), "https://one.google.com/settings"),
    Service(
        "microsoft",
        "Microsoft 365",
        "cloud",
        ("microsoft", "msft", "office 365", "xbox"),
        ("microsoft.com",),
        "https://account.microsoft.com/services",
    ),
    Service("dropbox", "Dropbox", "cloud", ("dropbox",), ("dropbox.com",), "https://www.dropbox.com/account/plan"),
    Service("adobe", "Adobe", "software", ("adobe",), ("adobe.com",), "https://account.adobe.com/plans"),
    Service("canva", "Canva", "software", ("canva",), ("canva.com",)),
    Service("notion", "Notion", "software", ("notion",), ("notion.so", "makenotion.com")),
    Service("github", "GitHub", "software", ("github",), ("github.com",), "https://github.com/settings/billing"),
    Service("chatgpt", "ChatGPT", "ai", ("openai", "chatgpt"), ("openai.com", "tm.openai.com")),
    Service("claude", "Claude", "ai", ("anthropic", "claude.ai"), ("anthropic.com",), "https://claude.ai/settings/billing"),
    Service("gemini", "Google AI (Gemini)", "ai", ("gemini",), ()),
    Service("linkedin", "LinkedIn Premium", "software", ("linkedin",), ("linkedin.com",)),
    Service("duolingo", "Duolingo", "learning", ("duolingo",), ("duolingo.com",)),
    Service("audible", "Audible", "learning", ("audible",), ("audible.com",)),
    Service("playstation", "PlayStation Plus", "games", ("playstation", "sony interactive", "psn"), ("playstation.com",)),
    Service("nintendo", "Nintendo", "games", ("nintendo",), ("nintendo.com",)),
    Service("careem", "Careem Plus", "delivery", ("careem plus", "careem"), ("careem.com",)),
    Service("noon", "noon One", "delivery", ("noon one", "noon vip"), ()),
    Service("hungerstation", "HungerStation Pro", "delivery", ("hungerstation pro", "هنقرستيشن برو"), ()),
    Service("jahez", "Jahez Plus", "delivery", ("jahez plus", "جاهز بلس"), ()),
    Service("talabat", "talabat pro", "delivery", ("talabat pro",), ()),
    Service("uber", "Uber One", "delivery", ("uber one",), ()),
)
_BY_KEY = {service.key: service for service in CATALOG}

# Words in card statements that say nothing about the merchant.
_NOISE = {
    "com", "www", "net", "sa", "ksa", "riyadh", "jeddah", "dammam", "pos", "purchase", "payment", "online", "llc",
    "inc", "ltd", "co", "store", "bill", "the", "help", "subscription", "subscriptions", "mada", "visa", "card",
    "شراء", "عبر", "الانترنت", "نقاط", "بيع", "اشتراك",
}  # fmt: skip
_WORD = re.compile(r"[a-z؀-ۿ]+")

SUBSCRIPTION_WORDS = re.compile(
    r"subscription|renew|membership|your plan|recurring|auto-?pay|اشتراك|تجديد|عضوية|باقتك|الباقة", re.IGNORECASE
)
RECEIPT_WORDS = re.compile(r"receipt|invoice|payment|charged|billing|order|فاتورة|إيصال|ايصال|دفع|تم خصم", re.IGNORECASE)
TRIAL_WORDS = re.compile(r"trial|تجريبي|التجربة", re.IGNORECASE)
TRIAL_END_WORDS = re.compile(r"end|expir|last day|will be charged|ينتهي|تنتهي|انتهاء|سيتم", re.IGNORECASE)
CANCEL_WORDS = re.compile(r"cancel|ended your|has ended|إلغاء|الغاء|تم إيقاف", re.IGNORECASE)

_CURRENCY_WORDS = {
    "sar": "SAR", "sr": "SAR", "ر.س": "SAR", "رس": "SAR", "ريال": "SAR", "usd": "USD", "$": "USD", "us$": "USD",
    "aed": "AED", "د.إ": "AED", "eur": "EUR", "€": "EUR", "gbp": "GBP", "£": "GBP", "kwd": "KWD", "bhd": "BHD",
    "qar": "QAR", "egp": "EGP",
}  # fmt: skip
_CUR = r"(sar|sr|ر\.س|رس|ريال|usd|us\$|\$|aed|د\.إ|eur|€|gbp|£|kwd|bhd|qar|egp)"
_NUM = r"(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)"
_AMOUNT_BEFORE = re.compile(_CUR + r"\s?" + _NUM, re.IGNORECASE)
_AMOUNT_AFTER = re.compile(_NUM + r"\s?" + _CUR, re.IGNORECASE)
_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩٫٬", "0123456789.,")


@dataclass
class Charge:
    key: str
    name: str
    on: date
    source: str  # expenses, bank, email
    amount: Decimal | None = None
    currency: str | None = None
    evidence: str | None = None
    # Email only: says it renews, a trial ends, or it was cancelled.
    # False for emails that only warn (a trial ending) or say it was cancelled.
    is_charge: bool = True
    says_subscription: bool = False
    trial_ends: bool = False
    cancelled: bool = False
    known: bool = False


@dataclass
class Found:
    key: str
    name: str
    kind: str | None
    period: str
    amount: Decimal | None
    currency: str | None
    previous_amount: Decimal | None
    first_seen_on: date
    last_charged_on: date
    next_expected_on: date | None
    charges: int
    sources: list[str]
    evidence: str | None
    cancel_url: str | None
    flags: list[str] = field(default_factory=list)


def service_for(text: str | None) -> Service | None:
    lowered = (text or "").lower()
    for service in CATALOG:
        if any(alias in lowered for alias in service.aliases):
            return service
    return None


def service_for_domain(domain: str) -> Service | None:
    domain = domain.lower()
    for service in CATALOG:
        if any(domain == known or domain.endswith("." + known) for known in service.domains):
            return service
    return None


def merchant_key(text: str | None) -> tuple[str, str]:
    """(key, name to show) for a merchant as a statement or SMS writes it, like "NETFLIX.COM 866-579" -> netflix."""
    service = service_for(text)
    if service:
        return service.key, service.name
    words = [word for word in _WORD.findall((text or "").lower()) if word not in _NOISE and len(word) > 1]
    if not words:
        return "", ""
    key = " ".join(words[:2])
    return key, " ".join(word.capitalize() for word in words[:3])[:120]


def parse_amount(text: str) -> tuple[Decimal, str] | None:
    """The first money amount in a line, like "SAR 45.00", "٤٥ ريال" or "$9.99"."""
    text = text.translate(_ARABIC_DIGITS)
    for pattern, number_at, currency_at in ((_AMOUNT_BEFORE, 2, 1), (_AMOUNT_AFTER, 1, 2)):
        match = pattern.search(text)
        if match:
            try:
                amount = Decimal(match.group(number_at).replace(",", ""))
            except InvalidOperation:
                continue
            if amount > 0:
                return amount, _CURRENCY_WORDS[match.group(currency_at).lower()]
    return None


def email_charge(mail: gmail_api.MailHeader) -> Charge | None:
    """What one email says about a subscription, or None when it is about something else."""
    subject = mail.subject
    text = f"{subject} {mail.snippet}"
    service = service_for_domain(mail.sender_domain) or service_for(f"{mail.sender_name} {subject}")
    says_subscription = bool(SUBSCRIPTION_WORDS.search(subject))
    is_receipt = bool(RECEIPT_WORDS.search(subject))
    trial = bool(TRIAL_WORDS.search(subject))
    cancelled = bool(CANCEL_WORDS.search(subject)) and not trial
    if not (says_subscription or is_receipt or trial or cancelled):
        return None
    found = parse_amount(text)
    if service:
        key, name = service.key, service.name
    else:
        # Unknown senders count only when the email itself says subscription; receipts from shops are not.
        if not (says_subscription or (trial and TRIAL_END_WORDS.search(text))):
            return None
        key, name = merchant_key(mail.sender_name or mail.sender_domain.split(".")[0])
        if not key:
            return None
    return Charge(
        key=key,
        name=name,
        on=mail.sent_at.date(),
        source="email",
        amount=found[0] if found and not cancelled else None,
        currency=found[1] if found and not cancelled else None,
        evidence=subject[:160] or None,
        is_charge=not cancelled and not trial,
        says_subscription=says_subscription,
        trial_ends=trial and bool(TRIAL_END_WORDS.search(text)),
        cancelled=cancelled,
        known=service is not None,
    )


def _period(gaps: list[int]) -> str | None:
    if not gaps:
        return None
    gap = statistics.median(gaps)
    if 5 <= gap <= 9:
        return "weekly"
    if 25 <= gap <= 35:
        return "monthly"
    if 340 <= gap <= 390:
        return "yearly"
    return None


def _merge_same_payment(charges: list[Charge]) -> list[Charge]:
    """A receipt email and the SMS for the same payment are one charge: same amount within 3 days."""
    merged: list[Charge] = []
    for charge in sorted(charges, key=lambda c: c.on):
        twin = next(
            (
                kept
                for kept in merged
                if abs((kept.on - charge.on).days) <= 3
                and kept.source != charge.source
                and (kept.amount is None or charge.amount is None or abs(kept.amount - charge.amount) <= Decimal("0.05") * kept.amount)
            ),
            None,
        )
        if twin is None:
            merged.append(charge)
            continue
        twin.source = ",".join(sorted({*twin.source.split(","), charge.source}))
        if twin.amount is None and charge.amount is not None:
            twin.amount, twin.currency = charge.amount, charge.currency
        twin.evidence = twin.evidence or charge.evidence
    return merged


def next_charge(last: date, period: str) -> date:
    if period == "weekly":
        return last + timedelta(days=7)
    months = 1 if period == "monthly" else 12
    month = last.month - 1 + months
    year, month = last.year + month // 12, month % 12 + 1
    for day in range(last.day, 27, -1):
        try:
            return date(year, month, day)
        except ValueError:
            continue
    return date(year, month, min(last.day, 28))


def _group(key: str, charges: list[Charge], today: date) -> Found | None:
    service = _BY_KEY.get(key)
    known = service is not None or any(c.known for c in charges)
    paid = _merge_same_payment([c for c in charges if c.is_charge])
    trial = [c for c in charges if c.trial_ends and (today - c.on).days <= TRIAL_WINDOW_DAYS]
    dates = sorted({c.on for c in paid})
    gaps = [(b - a).days for a, b in zip(dates, dates[1:], strict=False)]
    period = _period(gaps)
    amounts = [c.amount for c in paid if c.amount is not None]
    if not known and not trial:
        steady = bool(amounts) and max(amounts) <= min(amounts) * Decimal("1.10")
        regular = period is not None and steady and len(amounts) == len(paid) and len(dates) >= 2
        if len(dates) == 2:
            regular = regular and max(amounts) - min(amounts) <= Decimal("0.02") * max(amounts)
        renewal_mail = any(c.says_subscription and c.amount is not None and "email" in c.source for c in paid)
        if not (regular or renewal_mail):
            return None
    if not dates and not trial:
        return None
    period = period or "monthly"
    last = dates[-1] if dates else max(c.on for c in trial)
    if any(c.cancelled and c.on >= last for c in charges):
        return None  # cancelled after the last charge
    if not trial and last + timedelta(days=GRACE[period]) < today:
        return None  # it stopped
    with_amount = sorted((c for c in paid if c.amount is not None), key=lambda c: c.on)
    latest = with_amount[-1] if with_amount else next((c for c in sorted(trial, key=lambda c: c.on, reverse=True) if c.amount), None)
    previous = None
    if latest is not None:
        previous = next((c.amount for c in reversed(with_amount[:-1]) if c.currency == latest.currency and c.amount != latest.amount), None)
    everything = sorted(charges, key=lambda c: c.on)
    found = Found(
        key=key,
        name=(service.name if service else max((c.name for c in charges), key=len))[:120],
        kind=service.kind if service else None,
        period=period,
        amount=latest.amount if latest else None,
        currency=latest.currency if latest else None,
        previous_amount=previous if previous is not None and latest and latest.amount and previous < latest.amount else None,
        first_seen_on=everything[0].on,
        last_charged_on=last,
        next_expected_on=next_charge(last, period) if dates else None,
        charges=len(dates),
        sources=sorted({part for c in charges for part in c.source.split(",")}),
        evidence=next((c.evidence for c in reversed(everything) if c.evidence), None),
        cancel_url=service.cancel_url if service else None,
    )
    if found.previous_amount is not None and found.amount and found.amount > found.previous_amount * Decimal("1.03"):
        found.flags.append("price_up")
    if trial and (not dates or max(c.on for c in trial) >= dates[-1]):
        found.flags.append("trial_ending")
    return found


def detect(charges: Iterable[Charge], today: date, tracked_keys: set[str] | None = None) -> list[Found]:
    """Every subscription that seems to be running, newest charge first."""
    groups: dict[str, list[Charge]] = defaultdict(list)
    for charge in charges:
        if charge.key:
            groups[charge.key].append(charge)
    finds = [found for key, items in groups.items() if (found := _group(key, items, today))]
    tracked = tracked_keys or set()
    for found in finds:
        if found.key not in tracked:
            found.flags.append("untracked")
    kinds: dict[str, int] = defaultdict(int)
    for found in finds:
        if found.kind in OVERLAP_KINDS:
            kinds[found.kind] += 1
    for found in finds:
        if found.kind and kinds[found.kind] > 1:
            found.flags.append("duplicate")
    return sorted(finds, key=lambda f: f.last_charged_on, reverse=True)


def cancel_link(find: SubscriptionFind) -> str:
    """Where the Cancel button goes: the service's own page when known, else a web search for how to cancel it."""
    return find.cancel_url or f"https://www.google.com/search?q={quote_plus(f'how to cancel {find.name} subscription')}"


def monthly_cost(find: SubscriptionFind) -> Decimal | None:
    if find.amount is None:
        return None
    return (find.amount * PER_MONTH[find.period]).quantize(Decimal("0.01"))


# --- Reading the user's data -------------------------------------------------------------------------------------


def _ledger_charges(db: Session, user_id: uuid.UUID, since: datetime) -> list[Charge]:
    charges: list[Charge] = []
    for expense in db.scalars(select(Expense).where(Expense.user_id == user_id, Expense.spent_at >= since)):
        key, name = merchant_key(expense.merchant)
        service = _BY_KEY.get(key)
        # Unknown merchants only from spending that could be a subscription; groceries every week are not.
        if not service and expense.category not in {"subscriptions", "bills", "services", "fitness", "other"}:
            continue
        charges.append(Charge(key, name, expense.spent_at.date(), "expenses", expense.amount, expense.currency, known=service is not None))
    bank_rows = select(BankTransaction).where(
        BankTransaction.user_id == user_id,
        BankTransaction.received_at >= since,
        BankTransaction.kind == "purchase",
        BankTransaction.status != "ignored",
        # Confirmed SMS became an expense already; that one counts above.
        BankTransaction.expense_id.is_(None),
    )
    for row in db.scalars(bank_rows):
        key, name = merchant_key(row.merchant)
        if key:
            charges.append(Charge(key, name, row.received_at.date(), "bank", row.amount, row.currency, known=key in _BY_KEY))
    return charges


def gmail_query(days: int = LOOKBACK_DAYS) -> str:
    words = "subscription OR renewal OR renew OR membership OR receipt OR invoice OR trial OR اشتراك OR تجديد OR فاتورة OR إيصال OR عضوية"
    domains = " OR ".join(sorted({d for s in CATALOG for d in s.domains if d not in {"google.com", "apple.com"}}))
    return f"newer_than:{days}d -in:spam -in:trash (subject:({words}) OR from:({domains}))"


def _email_charges(db: Session, user_id: uuid.UUID) -> tuple[list[Charge], int]:
    access = gmail_api.access_token(db, user_id)
    ids = gmail_api.search(access, gmail_query(), EMAIL_LIMIT)
    mails = gmail_api.messages(access, ids)
    return [charge for mail in mails if (charge := email_charge(mail))], len(mails)


def _tracked_keys(db: Session, user_id: uuid.UUID) -> set[str]:
    bills = db.scalars(select(Bill).where(Bill.user_id == user_id, Bill.status != "paid", Bill.recurrence != "once"))
    return {key for bill in bills if (key := merchant_key(bill.name)[0])}


def scan(db: Session, user_id: uuid.UUID, today: date) -> SubscriptionScan:
    """Reads expenses, bank SMS and (when linked) Gmail, then saves what it found. Keeps the user's decisions."""
    since = datetime.now(UTC) - timedelta(days=LOOKBACK_DAYS)
    charges = _ledger_charges(db, user_id, since)
    emails_read = 0
    email_error: str | None = None
    try:
        email, emails_read = _email_charges(db, user_id)
        charges += email
    except gmail_api.NotConnected:
        pass
    except gmail_api.GmailError as exc:
        email_error = str(exc)
        connection = db.get(GmailConnection, user_id)
        if connection is not None:
            connection.last_error = email_error

    finds = detect(charges, today, _tracked_keys(db, user_id))
    existing = {row.key: row for row in db.scalars(select(SubscriptionFind).where(SubscriptionFind.user_id == user_id))}
    seen: set[str] = set()
    for found in finds:
        seen.add(found.key)
        row = existing.get(found.key)
        if row is None:
            row = SubscriptionFind(user_id=user_id, key=found.key, status="new")
            db.add(row)
        _apply(row, found)
    # A find nobody acted on that no longer shows up has stopped: drop it. Decided ones stay as the user left them.
    gone = [key for key, row in existing.items() if key not in seen and row.status == "new"]
    if gone:
        db.execute(delete(SubscriptionFind).where(SubscriptionFind.user_id == user_id, SubscriptionFind.key.in_(gone)))
    record = db.get(SubscriptionScan, user_id) or SubscriptionScan(user_id=user_id)
    record.scanned_at = datetime.now(UTC)
    record.emails_read = emails_read
    record.email_error = email_error
    db.add(record)
    if email_error is None:
        connection = db.get(GmailConnection, user_id)
        if connection is not None and emails_read:
            connection.last_error = None
    db.commit()
    return record


def _apply(row: SubscriptionFind, found: Found) -> None:
    for name in (
        "name", "kind", "period", "amount", "currency", "previous_amount", "first_seen_on", "last_charged_on",
        "next_expected_on", "charges", "sources", "evidence", "cancel_url",
    ):  # fmt: skip
        setattr(row, name, getattr(found, name))
    flags = list(found.flags)
    if row.status == "tracked" and "untracked" in flags:
        flags.remove("untracked")
    if row.status == "cancelled" and row.status_changed_at and found.last_charged_on > row.status_changed_at.date():
        flags.append("charged_after_cancel")
    row.flags = flags


def summary(rows: list[SubscriptionFind]) -> dict[str, Any]:
    """Monthly cost per currency of what is still running, and of what isn't tracked in bills."""
    running: dict[str, Decimal] = defaultdict(Decimal)
    forgotten: dict[str, Decimal] = defaultdict(Decimal)
    for row in rows:
        cost = monthly_cost(row)
        if cost is None or not row.currency or row.status in {"cancelled", "dismissed"}:
            continue
        running[row.currency] += cost
        if "untracked" in row.flags and row.status == "new":
            forgotten[row.currency] += cost
    return {"monthly": dict(running), "untracked_monthly": dict(forgotten)}
