"""Regressions found by adversarial synthetic messages, run as if the bank were verified."""

import pytest

from app.services.bank_sms import SensitiveMessage, parse_sms


@pytest.mark.parametrize(
    "message",
    [
        "رمز: 482913",
        "الرمز 482913 لعملية شراء 50 ريال",
        "رمز المرور 1234",
        "رمز العملية 4829 شراء مبلغ 50 ريال",
        "كود 4829",
        "رقم التعريف الشخصي 1234",
        "Your code is 482913",
        "code: 482913",
        "OTP482913",
        "PIN1234",
        "Use 482913 to verify your purchase of SAR 50",
        "Purchase SAR 50 card 4111 1111 1111 1111",
    ],
)
def test_sensitive_is_rejected(message):
    with pytest.raises(SensitiveMessage):
        parse_sms("rajhi", message, verified=True)


@pytest.mark.parametrize(
    "message",
    [
        "تم رفض عملية شراء\nمبلغ: 50 ريال",
        "رفضت عملية شراء مبلغ: 50 ريال",
        "تعذر تنفيذ عملية الشراء مبلغ: 50 ريال",
        "لم تنجح عملية الشراء مبلغ: 50 ريال",
        "لم يتم تنفيذ عملية الشراء مبلغ: 50 ريال",
        "عملية شراء غير مقبولة 50 ريال",
        "رصيد غير كاف لعملية شراء 50 ريال",
        "Purchase denied SAR 50",
        "Purchase not approved SAR 50",
        "Insufficient funds for purchase SAR 50",
        "Unable to complete purchase SAR 50",
    ],
)
def test_failed_is_never_spend(message):
    parsed = parse_sms("rajhi", message, verified=True)
    assert parsed["status"] == "ignored"
    assert parsed["amount_minor"] is None


def test_time_next_to_currency_is_not_the_amount():
    parsed = parse_sms("rajhi", "Purchase 2026-11-01 12:30 SAR 250.00", verified=True)
    assert parsed["status"] == "needs_review"
    assert parsed["amount_minor"] is None
    assert "ambiguous_amount" in parsed["review_reasons"]


def test_date_and_amount_on_separate_lines_are_not_a_card_number():
    parsed = parse_sms("rajhi", "شراء\nتاريخ: 2026-11-01\n250.00 ريال", verified=True)
    assert parsed["amount_minor"] == 25000
    assert parsed["status"] == "confirmed"


@pytest.mark.parametrize(
    "message,kind",
    [
        ("حوالة داخلية صادرة\nمبلغ: 500 ريال", "transfer_out"),
        ("حوالة محلية واردة\nمبلغ: 500 ريال", "transfer_in"),
        ("سداد فاتورة بطاقة\nمبلغ: 900 ريال", "card_payment"),
    ],
)
def test_money_movements_stay_out_of_spend(message, kind):
    parsed = parse_sms("rajhi", message, verified=True)
    assert parsed["kind"] == kind
    assert parsed["status"] == "needs_review"
    assert "non_expense_movement" in parsed["review_reasons"]


@pytest.mark.parametrize("message", ["تحويل بين حساباتك 500 ريال", "Transfer between your accounts SAR 500"])
def test_own_account_transfer_is_not_spend(message):
    parsed = parse_sms("rajhi", message, verified=True)
    assert parsed["kind"] == "unknown"
    assert parsed["status"] == "needs_review"
