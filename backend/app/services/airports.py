"""The airports the travel assistant offers to pick from, with each one's time zone.

Google Flights takes an airport's three-letter IATA code. The list covers Saudi Arabia, the Gulf and the places people
there fly to most; any other code can still be typed in by hand. The time zone turns a flight's local departure time
(what Google Flights gives) into the moment the "leave for the airport" reminder fires.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Airport:
    code: str
    city: str
    city_ar: str
    country: str
    tz: str


_ROWS = [
    # Saudi Arabia
    ("RUH", "Riyadh", "الرياض", "SA", "Asia/Riyadh"),
    ("JED", "Jeddah", "جدة", "SA", "Asia/Riyadh"),
    ("DMM", "Dammam", "الدمام", "SA", "Asia/Riyadh"),
    ("MED", "Madinah", "المدينة المنورة", "SA", "Asia/Riyadh"),
    ("AHB", "Abha", "أبها", "SA", "Asia/Riyadh"),
    ("TIF", "Taif", "الطائف", "SA", "Asia/Riyadh"),
    ("TUU", "Tabuk", "تبوك", "SA", "Asia/Riyadh"),
    ("ELQ", "Qassim", "القصيم", "SA", "Asia/Riyadh"),
    ("HAS", "Hail", "حائل", "SA", "Asia/Riyadh"),
    ("GIZ", "Jazan", "جازان", "SA", "Asia/Riyadh"),
    ("AJF", "Al Jouf", "الجوف", "SA", "Asia/Riyadh"),
    ("ULH", "AlUla", "العلا", "SA", "Asia/Riyadh"),
    ("NUM", "NEOM Bay", "نيوم", "SA", "Asia/Riyadh"),
    ("YNB", "Yanbu", "ينبع", "SA", "Asia/Riyadh"),
    ("HOF", "Al Ahsa", "الأحساء", "SA", "Asia/Riyadh"),
    # The Gulf
    ("DXB", "Dubai", "دبي", "AE", "Asia/Dubai"),
    ("AUH", "Abu Dhabi", "أبوظبي", "AE", "Asia/Dubai"),
    ("SHJ", "Sharjah", "الشارقة", "AE", "Asia/Dubai"),
    ("DOH", "Doha", "الدوحة", "QA", "Asia/Qatar"),
    ("BAH", "Bahrain", "البحرين", "BH", "Asia/Bahrain"),
    ("KWI", "Kuwait", "الكويت", "KW", "Asia/Kuwait"),
    ("MCT", "Muscat", "مسقط", "OM", "Asia/Muscat"),
    ("SLL", "Salalah", "صلالة", "OM", "Asia/Muscat"),
    # The region
    ("CAI", "Cairo", "القاهرة", "EG", "Africa/Cairo"),
    ("HRG", "Hurghada", "الغردقة", "EG", "Africa/Cairo"),
    ("SSH", "Sharm El Sheikh", "شرم الشيخ", "EG", "Africa/Cairo"),
    ("AMM", "Amman", "عمّان", "JO", "Asia/Amman"),
    ("BEY", "Beirut", "بيروت", "LB", "Asia/Beirut"),
    ("IST", "Istanbul", "إسطنبول", "TR", "Europe/Istanbul"),
    ("SAW", "Istanbul Sabiha", "إسطنبول صبيحة", "TR", "Europe/Istanbul"),
    ("TZX", "Trabzon", "طرابزون", "TR", "Europe/Istanbul"),
    ("AYT", "Antalya", "أنطاليا", "TR", "Europe/Istanbul"),
    ("CMN", "Casablanca", "الدار البيضاء", "MA", "Africa/Casablanca"),
    ("RAK", "Marrakesh", "مراكش", "MA", "Africa/Casablanca"),
    ("TUN", "Tunis", "تونس", "TN", "Africa/Tunis"),
    ("GYD", "Baku", "باكو", "AZ", "Asia/Baku"),
    ("TBS", "Tbilisi", "تبليسي", "GE", "Asia/Tbilisi"),
    # Europe
    ("LHR", "London Heathrow", "لندن هيثرو", "GB", "Europe/London"),
    ("LGW", "London Gatwick", "لندن غاتويك", "GB", "Europe/London"),
    ("MAN", "Manchester", "مانشستر", "GB", "Europe/London"),
    ("CDG", "Paris", "باريس", "FR", "Europe/Paris"),
    ("NCE", "Nice", "نيس", "FR", "Europe/Paris"),
    ("FRA", "Frankfurt", "فرانكفورت", "DE", "Europe/Berlin"),
    ("MUC", "Munich", "ميونخ", "DE", "Europe/Berlin"),
    ("AMS", "Amsterdam", "أمستردام", "NL", "Europe/Amsterdam"),
    ("GVA", "Geneva", "جنيف", "CH", "Europe/Zurich"),
    ("ZRH", "Zurich", "زيورخ", "CH", "Europe/Zurich"),
    ("VIE", "Vienna", "فيينا", "AT", "Europe/Vienna"),
    ("MXP", "Milan", "ميلان", "IT", "Europe/Rome"),
    ("FCO", "Rome", "روما", "IT", "Europe/Rome"),
    ("MAD", "Madrid", "مدريد", "ES", "Europe/Madrid"),
    ("BCN", "Barcelona", "برشلونة", "ES", "Europe/Madrid"),
    ("ATH", "Athens", "أثينا", "GR", "Europe/Athens"),
    ("PRG", "Prague", "براغ", "CZ", "Europe/Prague"),
    ("SJJ", "Sarajevo", "سراييفو", "BA", "Europe/Sarajevo"),
    # Asia
    ("KUL", "Kuala Lumpur", "كوالالمبور", "MY", "Asia/Kuala_Lumpur"),
    ("BKK", "Bangkok", "بانكوك", "TH", "Asia/Bangkok"),
    ("HKT", "Phuket", "بوكيت", "TH", "Asia/Bangkok"),
    ("CGK", "Jakarta", "جاكرتا", "ID", "Asia/Jakarta"),
    ("DPS", "Bali", "بالي", "ID", "Asia/Makassar"),
    ("SIN", "Singapore", "سنغافورة", "SG", "Asia/Singapore"),
    ("MLE", "Maldives", "المالديف", "MV", "Indian/Maldives"),
    ("CMB", "Colombo", "كولومبو", "LK", "Asia/Colombo"),
    ("BOM", "Mumbai", "مومباي", "IN", "Asia/Kolkata"),
    ("DEL", "Delhi", "دلهي", "IN", "Asia/Kolkata"),
    ("ISB", "Islamabad", "إسلام آباد", "PK", "Asia/Karachi"),
    ("KHI", "Karachi", "كراتشي", "PK", "Asia/Karachi"),
    ("NRT", "Tokyo Narita", "طوكيو ناريتا", "JP", "Asia/Tokyo"),
    ("HND", "Tokyo Haneda", "طوكيو هانيدا", "JP", "Asia/Tokyo"),
    ("ICN", "Seoul", "سيول", "KR", "Asia/Seoul"),
    ("PEK", "Beijing", "بكين", "CN", "Asia/Shanghai"),
    ("CAN", "Guangzhou", "قوانغتشو", "CN", "Asia/Shanghai"),
    # Africa and the Americas
    ("NBO", "Nairobi", "نيروبي", "KE", "Africa/Nairobi"),
    ("ZNZ", "Zanzibar", "زنجبار", "TZ", "Africa/Dar_es_Salaam"),
    ("ADD", "Addis Ababa", "أديس أبابا", "ET", "Africa/Addis_Ababa"),
    ("JFK", "New York", "نيويورك", "US", "America/New_York"),
    ("IAD", "Washington", "واشنطن", "US", "America/New_York"),
    ("LAX", "Los Angeles", "لوس أنجلوس", "US", "America/Los_Angeles"),
    ("YYZ", "Toronto", "تورونتو", "CA", "America/Toronto"),
]

AIRPORTS: dict[str, Airport] = {row[0]: Airport(*row) for row in _ROWS}


def find(code: str) -> Airport | None:
    return AIRPORTS.get(code.strip().upper())
