"""Message shapes learnt from examples the user pastes, so a bank's new wording is one paste away.

An example becomes a pattern: the amount, currency, merchant, card's last 4 and reference turn into slots, words the
user marked (a name, a greeting) into "any text", every other number into "any number". What's left is the bank's own
fixed wording. The example and its values are never kept. A message counts as matching only when the whole of it fits.
"""

import re
from datetime import UTC, datetime
from typing import TypedDict

from app.models import BankSmsTemplate
from app.services.bank_sms import (
    _CURRENCY,
    _MONEY,
    _clean,
    category_for,
    check_sensitive,
    currency_code,
    is_failed,
    is_refund_or_balance,
    minor_units,
    parse_sms,
)

MOVEMENTS = {"transfer_in", "transfer_out", "card_payment", "cash_withdrawal"}
MAX_WILDCARDS = 12
# The bank's own wording must stay: with fewer fixed words a template would match almost anything with an amount in it.
MIN_FIXED_WORDS = 2

_SLOTS = {
    "amount": r"(?P<amount>\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)",
    "currency": rf"(?P<currency>{_CURRENCY})",
    "merchant": r"(?P<merchant>[^;؛\n\r]{1,100}?)",
    "card": r"(?P<card>\d{4})",
    "ref": r"(?P<ref>[A-Za-z0-9_-]{1,64})",
    "num": r"[\d.,:/-]+",
    # One word only: slots that could each take several words made matching exponential (a long name froze the API).
    "any": r"(?P<any{n}>[^\s;؛]{{1,60}})",
}
_TOKEN = re.compile(r"(\{\{|\}\}|\{(?:" + "|".join(_SLOTS) + r")\})")
_NUMBER_RUN = re.compile(r"\d[\d.,:/-]*")


class Fields(TypedDict):
    amount: str
    currency: str
    merchant: str | None
    card_last4: str | None
    reference: str | None
    wildcards: list[str]


def flat(message: str) -> str:
    """Cleaned text with spaces squeezed inside each line, blank lines dropped."""
    lines = (" ".join(line.split()) for line in _clean(message).splitlines())
    return "\n".join(line for line in lines if line)


def _spans(text: str, value: str, taken: list[tuple[int, int]], digits: bool) -> list[tuple[int, int]]:
    """Where a value stands on its own: a number never inside a bigger number, a date or a time."""
    edge = r"(?<![\d.,:/-])" if digits else r"(?<!\w)"
    tail = r"(?![.,:/-]?\d)" if digits else r"(?!\w)"
    found = (m.span() for m in re.finditer(edge + re.escape(value) + tail, text, re.IGNORECASE))
    return [span for span in found if all(span[1] <= start or span[0] >= end for start, end in taken)]


def build_pattern(example: str, fields: Fields) -> str:
    """Raises SensitiveMessage, or ValueError('<field>_not_in_example') when a value isn't in the example as written."""
    check_sensitive(example)
    text = flat(example)
    if minor_units(fields["amount"].strip()) is None:
        raise ValueError("amount_invalid")
    if currency_code(fields["currency"]) is None:
        raise ValueError("currency_invalid")
    wanted = [
        ("merchant", fields.get("merchant"), False),
        ("ref", fields.get("reference"), False),
        ("currency", fields["currency"], False),
        ("card", fields.get("card_last4"), True),
        ("amount", fields["amount"], True),
    ]
    spans: list[tuple[int, int, str]] = []
    names = {"merchant": "merchant", "ref": "reference", "currency": "currency", "card": "card_last4", "amount": "amount"}
    for slot, value, digits in wanted:
        if not value or not value.strip():
            continue
        found = _spans(text, " ".join(value.split()), [(a, b) for a, b, _ in spans], digits)
        if not found:
            raise ValueError(f"{names[slot]}_not_in_example")
        currency = next(((a, b) for a, b, name in spans if name == "currency"), None)
        # The amount the bank means sits next to the currency, not in a date before it.
        span = (
            min(found, key=lambda s: min(abs(s[0] - currency[1]), abs(currency[0] - s[1]))) if slot == "amount" and currency else found[0]
        )
        spans.append((*span, slot))
    words = {word.strip() for word in fields.get("wildcards") or [] if word.strip()}
    if len(words) > MAX_WILDCARDS:
        raise ValueError("too_many_wildcards")
    for word in words:
        spans += [(*span, "any") for span in _spans(text, word, [(a, b) for a, b, _ in spans], False)]

    pattern, at = [], 0
    for start, end, slot in sorted(spans):
        pattern.append(_literal(text[at:start]))
        pattern.append("{" + slot + "}")
        at = end
    pattern.append(_literal(text[at:]))
    result = "".join(pattern)
    fixed = _TOKEN.sub(" ", result)
    if len(re.findall(r"[^\W\d_]{2,}", fixed)) < MIN_FIXED_WORDS:
        raise ValueError("too_little_fixed_text")
    if re.search(r"\{amount\}[.,:/-]?\{num\}|\{num\}[.,:/-]?\{amount\}", result):
        raise ValueError("amount_unclear")
    return result


def _literal(part: str) -> str:
    return _NUMBER_RUN.sub("{num}", part.replace("{", "{{").replace("}", "}}"))


def _compile(pattern: str) -> re.Pattern[str]:
    regex, wild = [], 0
    for piece in _TOKEN.split(pattern):
        if piece in ("{{", "}}"):
            regex.append(re.escape(piece[0]))
        elif piece == "{any}":
            regex.append(_SLOTS["any"].format(n=wild))
            wild += 1
        elif piece.startswith("{") and piece.endswith("}") and piece[1:-1] in _SLOTS:
            regex.append(_SLOTS[piece[1:-1]])
        elif piece:
            # Any run of spaces or line breaks matches any other.
            regex.append(r"\s+".join(re.escape(word) for word in re.split(r"\s+", piece)))
    return re.compile("".join(regex), re.IGNORECASE)


def match(pattern: str, message: str) -> dict | None:
    """The values in a message that has exactly this shape, or None."""
    found = _compile(pattern).fullmatch(flat(message))
    if found is None:
        return None
    groups = found.groupdict()
    free_text = " ".join(value or "" for name, value in groups.items() if name == "merchant" or name.startswith("any"))
    # Free slots only hold names; declined, refund or balance wording, or another sum, means a different message.
    if is_failed(free_text) or is_refund_or_balance(free_text) or _MONEY.search(free_text):
        return None
    amount = minor_units(groups["amount"]) if groups.get("amount") else None
    currency = currency_code(groups["currency"]) if groups.get("currency") else None
    if amount is None or currency is None:
        return None
    merchant = (groups.get("merchant") or "").strip() or None
    return {
        "amount_minor": amount,
        "currency": currency,
        "merchant": merchant,
        "card_last4": groups.get("card"),
        "reference": groups.get("ref"),
    }


def read_with_templates(templates: list[BankSmsTemplate], message: str) -> dict | None:
    """A parse_sms-shaped result from the one template that fits. None when none fits; a conflict goes to review."""
    hits = [(template, values) for template in templates if (values := match(template.pattern, message))]
    if not hits:
        return None
    readings = {(template.kind, *values.values()) for template, values in hits}
    if len(readings) > 1:
        return {
            "kind": "unknown",
            "amount_minor": None,
            "currency": None,
            "merchant": None,
            "card_last4": None,
            "reference": None,
            "status": "needs_review",
            "category": "other",
            "review_reasons": ["template_conflict"],
        }
    template, values = hits[0]
    template.last_matched_at = datetime.now(UTC)
    return {
        "kind": template.kind,
        **values,
        "status": "needs_review",
        "category": category_for(values["merchant"]),
        "review_reasons": ["non_expense_movement"] if template.kind in MOVEMENTS else [],
        "template_id": template.id,
    }


def preview(example: str) -> dict:
    """What the generic reader sees in an example, each value as written in it, for the user to correct."""
    parsed = parse_sms(None, example)
    text = flat(example)
    amount = currency = ""
    for found in _MONEY.finditer(text):
        number = (found["num1"] or found["num2"]).strip()
        if minor_units(number) == parsed["amount_minor"]:
            amount, currency = number, (found["before"] or found["after"]).strip()
            break
    merchant = " ".join((parsed["merchant"] or "").split()) or None
    return {
        "fields": {
            "amount": amount,
            "currency": currency,
            "merchant": merchant,
            "card_last4": parsed["card_last4"],
            "reference": parsed["reference"],
            "wildcards": [],
        },
        "kind": parsed["kind"] if parsed["kind"] != "unknown" else "purchase",
        "words": text.split(),
    }
