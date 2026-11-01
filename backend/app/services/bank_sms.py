"""Conservative, provisional bank SMS parsers. Bank identity comes from the Shortcut's sender rule.

The test messages are synthetic. A bank's verified flag must stay False until its actual redacted
formats have been tested. Unknown or ambiguous text never becomes spending.
"""

import re
import unicodedata

BANKS = {
    "rajhi": {"name_ar": "مصرف الراجحي", "verified": False, "purchase_markers": ["شراء", "مشتريات", "نقاط البيع", "purchase", "pos"]},
    "alinma": {"name_ar": "مصرف الإنماء", "verified": False, "purchase_markers": ["شراء", "مشتريات", "purchase", "pos"]},
    "stc": {"name_ar": "STC Bank", "verified": False, "purchase_markers": ["عملية دفع", "شراء", "payment", "purchase", "pos"]},
    "d360": {"name_ar": "D360 Bank", "verified": False, "purchase_markers": ["شراء", "دفع", "purchase", "pos", "payment"]},
    "barq": {"name_ar": "برق", "verified": False, "purchase_markers": ["شراء", "دفع", "payment", "purchase", "pos"]},
    "snb": {"name_ar": "البنك الأهلي السعودي", "verified": False, "purchase_markers": ["شراء", "مشتريات", "purchase", "pos"]},
}

# Category keys are the app's FINANCE_CATEGORIES; the first match on the merchant wins.
CATEGORY_KEYWORDS = {
    "food": ["restaurant", "cafe", "coffee", "مطعم", "مقهى", "قهوة"],
    "groceries": ["grocery", "supermarket", "market", "بقالة", "تموينات", "سوبرماركت"],
    "shopping": ["shopping", "retail", "تسوق"],
    "transport": ["taxi", "uber", "fuel", "petrol", "وقود", "بنزين"],
    "bills": ["electricity", "utilities", "كهرباء", "فاتورة"],
    "subscriptions": ["subscription", "app store", "اشتراك"],
    "health": ["pharmacy", "hospital", "clinic", "صيدلية", "مستشفى", "عيادة"],
    "services": ["service", "خدمات"],
}

_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
_ARABIC = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ى": "ي", "٫": ".", "٬": ","})
_INVISIBLE = re.compile(r"[\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\u0640\u064b-\u065f\u0670]")
_SENSITIVE = re.compile(
    r"(?<![a-z])(?:otp|pin|cvv2?|cvc2?|password|passcode)(?![a-z])|one[ -]?time|verif(?:y|ication)|"
    r"security\s*code|auth(?:entication)?\s*code|(?<![a-z])code(?:\s+is|\s*[:：#-])?\s*\d|do\s*not\s*share|"
    r"(?<!\w)(?:ال)?(?:رمز|كود)(?:ك|كم)?(?!\w)|التعريف\s*الشخصي|"
    r"رقم\s*(?:التحقق|تحقق|الدخول|دخول|التفعيل|تفعيل|التاكيد|تاكيد|الامان|سري|التوثيق|توثيق)|"
    r"كلم[هة]\s*(?:المرور|مرور|السر)|(?:الرقم|رقم)\s*السري|لا\s*تشارك",
    re.IGNORECASE,
)
_FULL_NUMBER = re.compile(r"\b[A-Z]{2}\d{2}(?:\s*[A-Z0-9]){11,30}\b|(?<!\d)(?:\d[ \t.-]?){12,25}(?!\d)", re.IGNORECASE)
_ACCOUNT = re.compile(r"(?:\baccount(?:\s*(?:number|no\.?))?|حساب|الحساب)\s*[:：]?\s*(?:\d[\s.-]*){5,}", re.IGNORECASE)
_FAILED = re.compile(r"\b(?:declined|rejected|failed|unsuccessful|pending|cancelled|canceled|hold|denied|insufficient|not\s*approved|unable)\b|مرفوض|رفض|فشل|تعذر|غير\s*ناجح|غير\s*مقبول|غير\s*كاف|قيد\s*(?:الانتظار|التنفيذ)|ملغ[اي]|الغاء|لم\s*(?:تتم|يتم|تنجح)", re.IGNORECASE)
_CURRENCY = r"(?:[A-Z]{3}|[$€£¥]|ريال(?:\s*سعودي)?|ر\.?\s*س\.?)"
_NUMBER = r"[+-]?\s*\d[\d,.]*(?:[ \t]+\d[\d,.]*)*"
_MONEY = re.compile(rf"(?<![\w.])(?<!\d[:/-])(?:(?P<before>{_CURRENCY})\s*[:：]?\s*(?P<num1>{_NUMBER})|(?P<num2>{_NUMBER})\s*(?P<after>{_CURRENCY}))(?![\w.])", re.IGNORECASE)
_NUMBERS_AROUND_CURRENCY = re.compile(rf"\d\s*{_CURRENCY}\s*[+-]?\d", re.IGNORECASE)
_BALANCE = re.compile(r"\b(?:available\s+balance|balance|available\s+limit)\b|الرصيد|رصيد|المتاح", re.IGNORECASE)
_DATA_LABEL = r"merchant|at|لدى|لدي|التاجر|reference|ref|مرجع|المرجع|card|بطاقة|البطاقة"
_ALL_LABEL = _DATA_LABEL + r"|amount|total|fee|fees|tax|balance|status|type|date|time|مبلغ|المبلغ|الرصيد|رسوم|ضريبة|حالة|نوع|تاريخ|وقت"
_DATA_FIELD = re.compile(
    rf"(?<!\w)(?:{_DATA_LABEL})\s*[:：]\s*[^;؛]*?(?=[;؛]|\s+(?:{_ALL_LABEL})\s*[:：]|$)",
    re.IGNORECASE,
)
_BARE_AMOUNT = re.compile(
    rf"(?<!\w)(?:amount|total|fee|fees|tax|مبلغ|المبلغ|رسوم|ضريبة)\s*[:：]\s*{_NUMBER}(?=\s*(?:[;؛\n\r]|$))",
    re.IGNORECASE,
)
_SUPPORTED = {"SAR", "USD", "EUR", "GBP", "AED"}


class SensitiveMessage(ValueError):
    """The SMS must not be accepted, saved, or returned to the caller."""


def _clean(message):
    return _INVISIBLE.sub("", unicodedata.normalize("NFKC", message).translate(_DIGITS).translate(str.maketrans({"٫": ".", "٬": ","})))


def normalize_message(message: str) -> str:
    return " ".join(_clean(message).translate(_ARABIC).split()).casefold()


def _operation_text(clean):
    text = _DATA_FIELD.sub(" ", clean)
    return re.sub(r"\bcard\s*ending(?:\s*in)?\s*[*xX#-]*\s*\d{4}\b", " ", text, flags=re.IGNORECASE)


def _has(text, markers):
    for marker in markers:
        marker = normalize_message(marker)
        if re.search(r"(?<!\w)" + re.escape(marker) + r"(?!\w)", text):
            return True
    return False


def _kind(text, bank):
    if _has(text, ["refund", "refunded", "reversal", "استرداد", "استرجاع", "ارجاع"]):
        return "refund"
    if re.search(r"credit\s*card\s*(?:bill\s*)?payment|card\s*bill\s*payment|سداد\s*(?:فاتور[ةه]\s*)?(?:ال)?بطاق", text):
        return "card_payment"
    if _has(text, ["outgoing transfer", "transfer out"]) or re.search(r"(?:حوال[ةه]|تحويل)(?:\s+\S+){0,2}?\s+صادر", text):
        return "transfer_out"
    if _has(text, ["incoming transfer", "transfer in"]) or re.search(r"(?:حوال[ةه]|تحويل)(?:\s+\S+){0,2}?\s+وارد", text):
        return "transfer_in"
    if _has(text, ["cash withdrawal", "atm withdrawal", "سحب نقدي", "سحب صراف"]):
        return "cash_withdrawal"
    if _has(text, ["transfer", "حوالة", "تحويل"]):
        return "unknown"
    if _has(text, bank["purchase_markers"]):
        return "purchase"
    if _has(text, ["bank fee", "bank fees", "رسوم بنكية", "رسوم"]):
        return "fee"
    return "unknown"


def _amount(clean):
    matches = []
    for part in re.split(r"[;؛\n\r]+", clean):
        # Only explicitly labelled balance fields are excluded; other sums are ambiguous.
        part = _BALANCE.split(part, maxsplit=1)[0]
        if _BARE_AMOUNT.search(part) or _NUMBERS_AROUND_CURRENCY.search(part):
            return None, None, "ambiguous_amount"
        matches.extend(_MONEY.finditer(part))
    if len(matches) > 1:
        return None, None, "ambiguous_amount"
    if not matches:
        return None, None, "missing_amount"
    found = matches[0]
    currency = (found["before"] or found["after"]).upper()
    if currency.startswith(("ريال", "ر.")) or re.fullmatch(r"ر\s*س\.?", currency):
        currency = "SAR"
    if currency not in _SUPPORTED:
        return None, None, "unsupported_currency"
    number = (found["num1"] or found["num2"]).strip()
    if not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?", number):
        return None, None, "invalid_amount"
    whole, _, fraction = number.replace(",", "").partition(".")
    value = int(whole) * 100 + int(fraction.ljust(2, "0") or "0")
    if value <= 0 or value > 999_999_999_999:
        return None, None, "invalid_amount"
    return value, currency, None


def _label(clean, labels):
    match = re.search(r"(?:^|[;؛\n\r]|\s)(?:" + labels + r")\s*[:：]\s*([^;؛\n\r]{1,160})", clean, re.IGNORECASE)
    if not match:
        return None
    value = re.split(r"\s+(?:card|amount|reference|balance|بطاقة|مبلغ|مرجع|الرصيد)\s*[:：]", match[1], maxsplit=1, flags=re.IGNORECASE)[0].strip()
    return value[:100] or None


def parse_sms(bank: str, message: str, *, verified: bool | None = None) -> dict:
    if bank not in BANKS:
        raise ValueError("unknown_bank")
    if not isinstance(message, str) or not message.strip() or len(message) > 4000:
        raise ValueError("invalid_message")
    clean = _clean(message)
    text = normalize_message(message)
    if _SENSITIVE.search(text) or _FULL_NUMBER.search(clean) or _ACCOUNT.search(clean):
        raise SensitiveMessage("sensitive_message")
    operation = _operation_text(clean)
    operation_text = normalize_message(operation)
    result = {"kind": "unknown", "amount_minor": None, "currency": None,
              "merchant": None, "card_last4": None, "reference": None,
              "status": "needs_review", "category": "other", "review_reasons": []}
    if _FAILED.search(operation_text):
        result.update(status="ignored", review_reasons=["failed_or_pending"])
        return result
    result["kind"] = _kind(operation_text, BANKS[bank])
    if result["kind"] == "unknown":
        result["review_reasons"].append("unknown_format")
        return result
    amount, currency, issue = _amount(operation)
    result.update(amount_minor=amount, currency=currency)
    if issue:
        result["review_reasons"].append(issue)
    result["merchant"] = _label(clean, r"merchant|at|لدى|لدي|التاجر")
    reference = _label(clean, r"reference|ref|مرجع|المرجع")
    if reference and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", reference):
        result["reference"] = reference
    card = re.search(r"(?:\bcard(?:\s*ending(?:\s*in)?)?|بطاقة|البطاقة)\s*[:：]?\s*[*xX#-]*\s*(\d{4})(?!\d)", clean, re.IGNORECASE)
    if card:
        result["card_last4"] = card[1]
    merchant = normalize_message(result["merchant"] or "")
    for category, keywords in CATEGORY_KEYWORDS.items():
        if _has(merchant, keywords):
            result["category"] = category
            break
    if not (BANKS[bank]["verified"] if verified is None else verified):
        result["review_reasons"].append("unverified_bank_format")
    if result["kind"] in {"transfer_in", "transfer_out", "card_payment", "cash_withdrawal"}:
        result["review_reasons"].append("non_expense_movement")
    if not result["review_reasons"]:
        result["status"] = "confirmed"
    return result
