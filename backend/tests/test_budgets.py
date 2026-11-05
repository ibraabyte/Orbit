"""Monthly budgets: one limit per category per month, owner-scoped, part of the dashboard and the export."""

from fastapi.testclient import TestClient

from tests.conftest import bearer, sign_up

BODY = {"month": "2026-11-01", "category": "food", "amount": 800, "currency": "SAR"}


def test_one_limit_per_category_per_month(client: TestClient, auth: dict):
    assert client.post("/budgets", headers=auth, json=BODY).status_code == 201
    assert client.post("/budgets", headers=auth, json=BODY).status_code == 409
    # Another month or another category is fine.
    assert client.post("/budgets", headers=auth, json={**BODY, "month": "2026-12-01"}).status_code == 201
    assert client.post("/budgets", headers=auth, json={**BODY, "category": "transport"}).status_code == 201
    # Another user can set the same limit.
    other = bearer(sign_up(client, "other@example.com"))
    assert client.post("/budgets", headers=other, json=BODY).status_code == 201


def test_bad_values_are_refused(client: TestClient, auth: dict):
    for change in (
        {"month": "2026-11-15"},
        {"amount": 0},
        {"amount": -5},
        {"category": "gold"},
        {"currency": "RIYAL"},
    ):
        assert client.post("/budgets", headers=auth, json={**BODY, **change}).status_code == 422, change
    budget = client.post("/budgets", headers=auth, json=BODY).json()
    assert client.patch(f"/budgets/{budget['id']}", headers=auth, json={"month": "2026-11-09"}).status_code == 422
    assert client.patch(f"/budgets/{budget['id']}", headers=auth, json={"amount": 0}).status_code == 422


def test_budgets_reach_the_dashboard_and_the_export(client: TestClient, auth: dict):
    client.post("/budgets", headers=auth, json=BODY)
    assert [b["category"] for b in client.get("/dashboard", headers=auth).json()["budgets"]] == ["food"]
    exported = client.get("/export", headers=auth).json()["budgets"]
    assert [(b["month"], b["amount"]) for b in exported] == [("2026-11-01", 800.0)]


def test_delete_account_removes_budgets(client: TestClient, me: dict, db):
    from sqlalchemy import func, select

    from app.models import Budget

    client.post("/budgets", headers=bearer(me), json=BODY)
    assert db.scalar(select(func.count()).select_from(Budget)) == 1
    assert client.post("/auth/delete-account", headers=bearer(me), json={"password": "correct horse battery"}).status_code == 204
    assert db.scalar(select(func.count()).select_from(Budget)) == 0
