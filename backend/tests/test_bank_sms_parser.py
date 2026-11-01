"""All messages here are synthetic; they are not verified bank templates."""
import json
import unittest
from pathlib import Path

from app.services.bank_sms import SensitiveMessage, normalize_message, parse_sms

FIXTURES = Path(__file__).parent / "fixtures/bank_sms.json"


class ParserTests(unittest.TestCase):
    def setUp(self):
        self.assertTrue(callable(parse_sms), "parse_sms must be implemented")

    def verified(self, bank, message):
        return parse_sms(bank, message, verified=True)

    def test_six_banks_have_provisional_purchase_fixtures(self):
        fixtures = json.loads(FIXTURES.read_text())
        self.assertEqual({f["bank"] for f in fixtures}, {"rajhi", "alinma", "stc", "d360", "barq", "snb"})
        for fixture in fixtures:
            with self.subTest(bank=fixture["bank"]):
                result = parse_sms(fixture["bank"], fixture["message"])
                self.assertEqual(result["kind"], "purchase")
                self.assertEqual(result["amount_minor"], fixture["amount_minor"])
                self.assertEqual(result["currency"], "SAR")
                self.assertEqual(result["status"], "needs_review")
                self.assertIn("unverified_bank_format", result["review_reasons"])
                self.assertNotIn("message", result)

    def test_verified_arabic_purchase_exact_minor_units(self):
        r = self.verified("rajhi", "شراء نقاط البيع\nبطاقة: *1234\nمبلغ: ١٬٢٣٤٫٥٦ ر.س\nلدى: مقهى تجريبي\nالرصيد: 9000.00 ر.س")
        self.assertEqual((r["amount_minor"], r["currency"], r["card_last4"]), (123456, "SAR", "1234"))
        self.assertEqual(r["merchant"], "مقهى تجريبي")
        self.assertEqual(r["status"], "confirmed")
        self.assertEqual(r["category"], "food")

    def test_english_amount_and_merchant(self):
        r = self.verified("d360", "Online Purchase\nAmount: SAR 19.95\nCard ending 4321\nMerchant: TEST GROCERY\nReference: DEMO-X42")
        self.assertEqual((r["amount_minor"], r["card_last4"], r["reference"]), (1995, "4321", "DEMO-X42"))
        self.assertEqual(r["category"], "groceries")

    def test_amount_currency_order_and_decimal_forms(self):
        for text, expected in [("SAR 100",10000), ("100.50 SAR",10050), ("1,234.50 SAR",123450), ("١٢٫٥٠ ريال",1250), ("۱۲٫۵۰ ريال",1250)]:
            with self.subTest(text=text):
                self.assertEqual(self.verified("alinma", "POS Purchase; Amount: " + text)["amount_minor"], expected)

    def test_ambiguous_multiple_transaction_amounts_never_guessed(self):
        for text in ["Purchase Amount: SAR 10.00; Fee: SAR 1.00", "Purchase Amount: USD 10.00; Amount: SAR 37.50", "Purchase Amount: SAR 10; Amount: SAR 12", "Purchase Amount: SAR 10; Amount: SAR 10"]:
            with self.subTest(text=text):
                r = self.verified("snb", text)
                self.assertIsNone(r["amount_minor"])
                self.assertEqual(r["status"], "needs_review")
                self.assertIn("ambiguous_amount", r["review_reasons"])

    def test_no_amount_no_expense(self):
        for text in ["Purchase completed", "Purchase Amount: 40", "Purchase Amount: 1.999 SAR", "Purchase Amount: 1,23 SAR", "Purchase Amount: -10 SAR", "Purchase Amount: 0 SAR"]:
            with self.subTest(text=text):
                r = self.verified("barq", text)
                self.assertIsNone(r["amount_minor"])
                self.assertEqual(r["status"], "needs_review")

    def test_sensitive_messages_rejected_before_parsing(self):
        for text in ["OTP 123456 Purchase SAR 4", "رمز التحقق: ١٢٣٤", "رمز الدخول 1234", "كلمة المرور 123", "PIN 1234", "CVV 123", "Do not share this code", "Purchase Card 4111111111111111 SAR 5", "Purchase card 4111 1111 1111 1111 Amount: SAR 5", "Purchase IBAN SA0380000000608010167519 SAR 5", "Purchase card 4111.1111.1111.1111 Amount: SAR 5", "Purchase Account: 123456789 Amount: SAR 5", "شراء حساب: 123456789 مبلغ: 5 ريال", "رمز التأكيد 123456", "رقم التحقق 123456"]:
            with self.subTest(text=text):
                with self.assertRaises(SensitiveMessage):
                    parse_sms("rajhi", text)

    def test_declined_pending_not_expenses(self):
        for text in ["Purchase declined; Amount: SAR 10", "عملية شراء مرفوضة بمبلغ 10 ريال", "Purchase pending; Amount: SAR 10", "Purchase failed; Amount: SAR 10", "Purchase rejected Amount: SAR 10", "تم إلغاء شراء بمبلغ 10 ريال", "Purchase authorization hold Amount: SAR 10"]:
            with self.subTest(text=text):
                r = self.verified("stc", text)
                self.assertEqual(r["status"], "ignored")

    def test_refund_is_separate_kind(self):
        r = self.verified("snb", "Refund Amount: SAR 17.50; Merchant: TEST STORE")
        self.assertEqual((r["kind"], r["amount_minor"], r["status"]), ("refund", 1750, "confirmed"))

    def test_transfers_cash_card_payments_require_review(self):
        for text,kind in [("Outgoing transfer Amount: SAR 10", "transfer_out"), ("Incoming transfer Amount: SAR 10", "transfer_in"), ("حوالة صادرة مبلغ: 10 ريال", "transfer_out"), ("حوالة واردة مبلغ: 10 ريال", "transfer_in"), ("Credit card payment Amount: SAR 10", "card_payment"), ("سداد بطاقة ائتمانية مبلغ: 10 ريال", "card_payment"), ("ATM withdrawal Amount: SAR 10", "cash_withdrawal")]:
            with self.subTest(text=text):
                r = self.verified("alinma",text)
                self.assertEqual(r["kind"],kind)
                self.assertEqual(r["status"],"needs_review")

    def test_purchase_with_extra_fee_stays_purchase_and_requires_review(self):
        r = self.verified("rajhi", "شراء مبلغ: 10 ريال; رسوم: 1 ريال")
        self.assertEqual(r["kind"], "purchase")
        self.assertEqual(r["status"], "needs_review")
        self.assertIsNone(r["amount_minor"])

    def test_fee_is_expense_kind(self):
        r=self.verified("barq","Bank fee Amount: SAR 2.50")
        self.assertEqual((r["kind"],r["amount_minor"],r["status"]),("fee",250,"confirmed"))

    def test_unknown_message_requires_review(self):
        r = self.verified("rajhi", "Welcome. Balance: SAR 100.00")
        self.assertEqual((r["kind"],r["status"],r["amount_minor"]),("unknown","needs_review",None))

    def test_unknown_bank_rejected(self):
        with self.assertRaises(ValueError):
            parse_sms("fake", "Purchase Amount: SAR 5")

    def test_merchant_and_reference_limited_to_label(self):
        r = self.verified("snb", "POS; Amount: SAR 9.90; Merchant: TEST SHOP; Card: *1234; Reference: ABC-123")
        self.assertEqual(r["merchant"], "TEST SHOP")
        self.assertEqual(r["reference"], "ABC-123")

    def test_data_fields_do_not_change_operation_type_or_status(self):
        for message in [
            "Purchase; Amount: SAR 10; Merchant: REFUND CAFE",
            "Purchase; Merchant: Declined Shop; Amount: SAR 10",
            "Purchase Merchant: REFUND CAFE Amount: SAR 10 Reference: failed",
            "Purchase\nMerchant:\nREFUND CAFE\nAmount: SAR 10\nReference: declined",
            "Purchase; Amount: SAR 10; Card: pending; Reference: refund",
            "Purchase\nMerchant: TEST\nREFUND CAFE\nAmount: SAR 10",
            "Purchase\nReference: TEST\nDECLINED\nAmount: SAR 10",
        ]:
            with self.subTest(message=message):
                r = self.verified("rajhi", message)
                self.assertEqual(r["kind"], "purchase")
                self.assertEqual(r["status"], "confirmed")

    def test_additional_arabic_authentication_and_spaced_accounts_rejected(self):
        for message in [
            "كود التحقق 123456; شراء; مبلغ: 5 ريال; لدى: متجر",
            "رمز توثيق 123456; شراء; مبلغ: 5 ريال; لدى: متجر",
            "Purchase; Amount: SAR 5; Merchant: account: 1234 5678",
            "Purchase; Amount: SAR 5; حساب: 1234-5678",
        ]:
            with self.subTest(message=message):
                with self.assertRaises(SensitiveMessage):
                    parse_sms("rajhi", message)

    def test_unsupported_currency_or_symbol_is_not_skipped(self):
        for message in [
            "Purchase; Amount: 100 CNY; Total: 50 SAR",
            "Purchase; Amount: $10; Total: SAR 35",
            "Purchase; Amount: 10 EUR; Total: ¥200",
        ]:
            with self.subTest(message=message):
                r = self.verified("rajhi", message)
                self.assertIsNone(r["amount_minor"])
                self.assertEqual(r["status"], "needs_review")

    def test_partial_or_unlabelled_transaction_amount_is_not_chosen(self):
        for message in [
            "Purchase; Amount: 1 234.56 SAR",
            "Purchase; Amount: - 10 SAR",
            "Purchase; Amount: 10; Fee: SAR 2",
            "Purchase; Amount: SAR 10; Tax: 2",
            "Purchase; Amount: 10; SAR 2",
        ]:
            with self.subTest(message=message):
                r = self.verified("rajhi", message)
                self.assertIsNone(r["amount_minor"])
                self.assertEqual(r["status"], "needs_review")

    def test_normalization_stable(self):
        self.assertEqual(normalize_message("  شراء\u200f\n ١٢٫٥٠ ريال "), normalize_message("شراء 12.50 ريال"))


if __name__ == "__main__":
    unittest.main()
