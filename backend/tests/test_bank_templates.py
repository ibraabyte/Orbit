"""Templates learnt from pasted examples. All messages are synthetic."""

import pytest
from fastapi.testclient import TestClient

from app.services.bank_sms import SensitiveMessage
from app.services.bank_templates import build_pattern, match

from .conftest import bearer, sign_up

EX = "عزيزي Ahmed\nشراء عبر مدى\nبطاقة: *1234\nمبلغ: 25.50 SAR\nلدى: Cafe Demo\nمرجع: AB12CD\nالرصيد: 1,020.00 SAR\n15/11/26 14:05"
FIELDS = {
    "amount": "25.50",
    "currency": "SAR",
    "merchant": "Cafe Demo",
    "card_last4": "1234",
    "reference": "AB12CD",
    "wildcards": ["Ahmed"],
}
NEW = "عزيزي Sara\nشراء عبر مدى\nبطاقة: *9876\nمبلغ: 199.00 SAR\nلدى: Jarir Bookstore\nمرجع: ZZ99\nالرصيد: 80.10 SAR\n16/11/26 09:41"


def test_example_round_trips():
    found = match(build_pattern(EX, FIELDS), EX)
    assert found is not None
    assert (found["amount_minor"], found["currency"], found["merchant"], found["card_last4"], found["reference"]) == (
        2550,
        "SAR",
        "Cafe Demo",
        "1234",
        "AB12CD",
    )


def test_new_values_match():
    found = match(build_pattern(EX, FIELDS), NEW)
    assert found is not None
    assert (found["amount_minor"], found["merchant"], found["card_last4"], found["reference"]) == (19900, "Jarir Bookstore", "9876", "ZZ99")


def test_pattern_keeps_no_values():
    pattern = build_pattern(EX, FIELDS)
    for value in ("25.50", "Cafe Demo", "1234", "AB12CD", "Ahmed", "1,020.00", "14:05"):
        assert value not in pattern


def test_one_word_different_does_not_match():
    assert match(build_pattern(EX, FIELDS), NEW.replace("شراء", "استرداد")) is None


def test_declined_never_matches_a_purchase_template():
    assert match(build_pattern(EX, FIELDS), NEW.replace("Jarir Bookstore", "Jarir مرفوضة")) is None


def test_value_not_in_example_is_refused():
    with pytest.raises(ValueError, match="amount_not_in_example"):
        build_pattern(EX, {**FIELDS, "amount": "25.5"})


def test_sensitive_example_is_refused():
    with pytest.raises(SensitiveMessage):
        build_pattern(EX + "\nOTP 123456", FIELDS)


def test_extra_line_does_not_match():
    assert match(build_pattern(EX, FIELDS), NEW + "\nمبلغ: 5 SAR") is None


def body(**extra):
    return {"example": EX, "label": "مدى شراء", "kind": "purchase", "bank": "rajhi", "fields": FIELDS, **extra}


def test_preview_saves_nothing(client: TestClient, auth: dict):
    preview = client.post("/bank-sms/templates/preview", json={"example": EX}, headers=auth)
    assert preview.status_code == 200
    fields = preview.json()["fields"]
    assert (fields["amount"], fields["currency"], fields["card_last4"]) == ("25.50", "SAR", "1234")
    assert "Ahmed" in preview.json()["words"]
    assert client.get("/bank-sms/templates", headers=auth).json() == []


def test_create_list_delete(client: TestClient, auth: dict):
    created = client.post("/bank-sms/templates", json=body(), headers=auth)
    assert created.status_code == 201
    row = created.json()
    assert row["label"] == "مدى شراء" and row["kind"] == "purchase" and "Cafe Demo" not in row["pattern"]
    assert [r["id"] for r in client.get("/bank-sms/templates", headers=auth).json()] == [row["id"]]
    assert client.delete(f"/bank-sms/templates/{row['id']}", headers=auth).status_code == 204
    assert client.get("/bank-sms/templates", headers=auth).json() == []


def test_other_user_cannot_see_or_delete(client: TestClient, auth: dict):
    row = client.post("/bank-sms/templates", json=body(), headers=auth).json()
    other = bearer(sign_up(client, "other-templates@example.com"))
    assert client.get("/bank-sms/templates", headers=other).json() == []
    assert client.delete(f"/bank-sms/templates/{row['id']}", headers=other).status_code == 404


def test_create_with_wrong_value_is_422(client: TestClient, auth: dict):
    response = client.post("/bank-sms/templates", json=body(fields={**FIELDS, "merchant": "Not There"}), headers=auth)
    assert response.status_code == 422 and response.json()["detail"] == "merchant_not_in_example"
    assert "Cafe" not in response.text


def test_sensitive_example_is_422_and_not_echoed(client: TestClient, auth: dict):
    response = client.post("/bank-sms/templates/preview", json={"example": EX + "\nOTP 123456"}, headers=auth)
    assert response.status_code == 422 and "Ahmed" not in response.text


# Review fixes ------------------------------------------------------------------------------------------------------


def test_many_marked_words_stay_fast():
    import time

    name = "Mr Abdullah bin Saleh bin Mohammed Al Fulani"
    example = f"Dear {name}; Purchase; Amount: 25.50 SAR; Merchant: Cafe Demo; Card: *1234"
    pattern = build_pattern(example, {**FIELDS, "reference": None, "wildcards": ["Dear", *name.split()]})
    started = time.monotonic()
    assert match(pattern, "x " * 200) is None
    assert match(pattern, example + " and something else entirely " * 8) is None
    assert time.monotonic() - started < 0.5


@pytest.mark.parametrize("tail", ["Starbucks - refunded", "Starbucks reversed", "Starbucks. Balance 9,876.54 SAR"])
def test_refund_or_balance_in_a_slot_never_matches(tail):
    pattern = build_pattern(
        "Purchase 25 SAR at Cafe Demo", {**FIELDS, "amount": "25", "card_last4": None, "reference": None, "wildcards": []}
    )
    assert match(pattern, f"Purchase 40 SAR at {tail}") is None


def test_example_with_too_little_fixed_wording_is_refused():
    with pytest.raises(ValueError, match="too_little_fixed_text"):
        build_pattern(
            "Starbucks 50 SAR", {**FIELDS, "amount": "50", "merchant": "Starbucks", "card_last4": None, "reference": None, "wildcards": []}
        )


def test_amount_is_never_part_of_a_bigger_number():
    with pytest.raises(ValueError, match="amount_not_in_example"):
        build_pattern("Purchase 50.00 SAR at Cafe Demo", {**FIELDS, "amount": "50", "card_last4": None, "reference": None, "wildcards": []})


def test_amount_next_to_the_currency_wins_over_a_date():
    pattern = build_pattern(
        "15/11 Purchase 15 SAR at Cafe Demo", {**FIELDS, "amount": "15", "card_last4": None, "reference": None, "wildcards": []}
    )
    found = match(pattern, "16/11 Purchase 75.50 SAR at Jarir")
    assert found is not None and found["amount_minor"] == 7550
