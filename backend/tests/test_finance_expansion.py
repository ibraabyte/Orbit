"""Cards, where money is, investments and obligations: owner-scoped, same-owner links, dashboard, export and account deletion."""

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models as m
from tests.conftest import bearer, sign_up

CARD = {"name": "Travel card", "network": "visa", "kind": "credit", "last4": "4242", "expires_on": "2028-08-01"}
ACCOUNT = {"name": "Main account", "kind": "bank", "balance": 1500.5, "currency": "SAR"}
INVESTMENT = {"name": "Fund app", "kind": "funds", "invested": 1000, "current_value": 1080, "currency": "SAR", "started_on": "2026-01-10"}
PLAN = {
    "name": "Phone",
    "kind": "bnpl",
    "provider": "Pay later app",
    "total_amount": 400,
    "currency": "SAR",
    "installments": [
        {"due_on": "2026-11-01", "amount": 100, "paid_at": "2026-11-01T10:00:00+03:00"},
        {"due_on": "2026-12-01", "amount": 100},
        {"due_on": "2027-01-01", "amount": 100},
        {"due_on": "2027-02-01", "amount": 100},
    ],
}
BILL = {"name": "Streaming", "amount": 45, "currency": "SAR", "due_at": "2026-11-20", "category": "subscriptions"}


def test_crud_is_owner_scoped(client: TestClient, auth: dict):
    other = bearer(sign_up(client, "other@example.com"))
    for path, body, change in (
        ("/cards", CARD, {"name": "Daily card"}),
        ("/money-accounts", ACCOUNT, {"balance": -20}),
        ("/investments", INVESTMENT, {"current_value": 1100}),
        ("/obligations", {k: v for k, v in PLAN.items() if k != "installments"}, {"note": "Due on the 1st"}),
    ):
        created = client.post(path, headers=auth, json=body)
        assert created.status_code == 201, created.text
        row = created.json()
        assert client.patch(f"{path}/{row['id']}", headers=auth, json=change).status_code == 200
        assert client.get(path, headers=other).json() == []
        assert client.get(f"{path}/{row['id']}", headers=other).status_code == 404
        assert client.patch(f"{path}/{row['id']}", headers=other, json=change).status_code == 404
        assert client.delete(f"{path}/{row['id']}", headers=other).status_code == 404
        assert client.delete(f"{path}/{row['id']}", headers=auth).status_code == 204


def test_a_card_keeps_only_four_digits(client: TestClient, auth: dict):
    for last4 in ("424", "42424", "4242424242424242", "42a2", ""):
        assert client.post("/cards", headers=auth, json={**CARD, "last4": last4}).status_code == 422, last4
    assert client.post("/cards", headers=auth, json={**CARD, "expires_on": "2028-08-15"}).status_code == 422
    assert client.post("/cards", headers=auth, json={**CARD, "network": "unknown"}).status_code == 422
    # Nothing beyond the listed fields is accepted, so a full number or a security code can't ride along.
    assert client.post("/cards", headers=auth, json={**CARD, "number": "4242424242424242"}).status_code == 422
    assert client.post("/cards", headers=auth, json={**CARD, "cvv": "123"}).status_code == 422
    card = client.post("/cards", headers=auth, json=CARD).json()
    assert set(card) == {"id", "user_id", "created_at", "updated_at", "name", "network", "kind", "last4", "expires_on"}
    assert client.patch(f"/cards/{card['id']}", headers=auth, json={"last4": "12345"}).status_code == 422


def test_a_subscription_links_to_the_users_own_card(client: TestClient, auth: dict):
    card = client.post("/cards", headers=auth, json=CARD).json()
    bill = client.post("/bills", headers=auth, json={**BILL, "card_id": card["id"]})
    assert bill.status_code == 201, bill.text
    assert bill.json()["card_id"] == card["id"]

    other = bearer(sign_up(client, "other@example.com"))
    assert client.post("/bills", headers=other, json={**BILL, "card_id": card["id"]}).status_code == 422
    theirs = client.post("/bills", headers=other, json=BILL).json()
    assert client.patch(f"/bills/{theirs['id']}", headers=other, json={"card_id": card["id"]}).status_code == 422

    # Deleting the card keeps the subscription and only clears the link.
    assert client.delete(f"/cards/{card['id']}", headers=auth).status_code == 204
    kept = client.get(f"/bills/{bill.json()['id']}", headers=auth).json()
    assert kept["card_id"] is None
    assert kept["name"] == "Streaming"


def test_changing_an_investments_value_records_when(client: TestClient, auth: dict, db: Session):
    row = client.post("/investments", headers=auth, json=INVESTMENT).json()
    db.execute(m.Investment.__table__.update().values(valued_at=func.now() - func.make_interval(0, 0, 0, 10)))
    db.commit()
    old = client.get(f"/investments/{row['id']}", headers=auth).json()["valued_at"]
    renamed = client.patch(f"/investments/{row['id']}", headers=auth, json={"note": "Monthly top up"}).json()
    assert renamed["valued_at"] == old
    revalued = client.patch(f"/investments/{row['id']}", headers=auth, json={"current_value": 1200}).json()
    assert revalued["valued_at"] > old
    assert revalued["current_value"] == 1200
    for bad in ({"invested": -1}, {"current_value": -1}, {"kind": "lottery"}, {"currency": "RIYAL"}):
        assert client.post("/investments", headers=auth, json={**INVESTMENT, **bad}).status_code == 422, bad


def test_a_plan_saves_with_its_whole_schedule(client: TestClient, auth: dict, db: Session):
    created = client.post("/obligations/plan", headers=auth, json=PLAN)
    assert created.status_code == 201, created.text
    plan = created.json()
    installments = client.get("/obligation-installments", headers=auth).json()
    assert [(i["due_on"], i["amount"], i["paid_at"] is not None) for i in installments] == [
        ("2026-11-01", 100.0, True),
        ("2026-12-01", 100.0, False),
        ("2027-01-01", 100.0, False),
        ("2027-02-01", 100.0, False),
    ]
    assert {i["obligation_id"] for i in installments} == {plan["id"]}

    paid = client.patch(f"/obligation-installments/{installments[1]['id']}", headers=auth, json={"paid_at": "2026-12-01T09:00:00+03:00"})
    assert paid.status_code == 200
    assert client.patch(f"/obligation-installments/{installments[1]['id']}", headers=auth, json={"paid_at": None}).json()["paid_at"] is None

    # A bad installment refuses the whole plan.
    bad = {**PLAN, "installments": [*PLAN["installments"], {"due_on": "2027-03-01", "amount": 0}]}
    assert client.post("/obligations/plan", headers=auth, json=bad).status_code == 422
    assert client.post("/obligations/plan", headers=auth, json={**PLAN, "installments": []}).status_code == 422
    assert db.scalar(select(func.count()).select_from(m.Obligation)) == 1

    # Another user can't add an installment to it, and deleting the plan takes its installments.
    other = bearer(sign_up(client, "other@example.com"))
    sneaky = {"obligation_id": plan["id"], "due_on": "2027-03-01", "amount": 5}
    assert client.post("/obligation-installments", headers=other, json=sneaky).status_code == 422
    assert client.post("/obligation-installments", headers=auth, json=sneaky).status_code == 201
    assert client.delete(f"/obligations/{plan['id']}", headers=auth).status_code == 204
    assert db.scalar(select(func.count()).select_from(m.ObligationInstallment)) == 0


def test_new_data_reaches_the_dashboard_and_the_export(client: TestClient, auth: dict):
    client.post("/cards", headers=auth, json=CARD)
    client.post("/money-accounts", headers=auth, json=ACCOUNT)
    client.post("/investments", headers=auth, json=INVESTMENT)
    client.post("/obligations/plan", headers=auth, json=PLAN)
    dashboard = client.get("/dashboard", headers=auth).json()
    assert [c["last4"] for c in dashboard["cards"]] == ["4242"]
    assert [a["balance"] for a in dashboard["moneyAccounts"]] == [1500.5]
    assert [i["current_value"] for i in dashboard["investments"]] == [1080.0]
    assert [o["name"] for o in dashboard["obligations"]] == ["Phone"]
    assert len(dashboard["obligationInstallments"]) == 4

    exported = client.get("/export", headers=auth).json()
    assert [len(exported[key]) for key in ("cards", "money_accounts", "investments", "obligations", "obligation_installments")] == [1, 1, 1, 1, 4]


def test_delete_account_removes_everything_new(client: TestClient, me: dict, db: Session):
    auth = bearer(me)
    card = client.post("/cards", headers=auth, json=CARD).json()
    client.post("/bills", headers=auth, json={**BILL, "card_id": card["id"]})
    client.post("/money-accounts", headers=auth, json=ACCOUNT)
    client.post("/investments", headers=auth, json=INVESTMENT)
    client.post("/obligations/plan", headers=auth, json=PLAN)
    assert client.post("/auth/delete-account", headers=auth, json={"password": "correct horse battery"}).status_code == 204
    for model in (m.Card, m.Bill, m.MoneyAccount, m.Investment, m.Obligation, m.ObligationInstallment):
        assert db.scalar(select(func.count()).select_from(model)) == 0, model.__name__
