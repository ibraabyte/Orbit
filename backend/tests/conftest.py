"""Tests run against a real Postgres, built by the same Alembic migration the server runs.

Point ORBIT_TEST_DATABASE_URL at an empty database you don't mind wiping.
"""

import os
from collections.abc import Iterator

import pytest

DATABASE_URL = os.environ.get("ORBIT_TEST_DATABASE_URL", "postgresql+psycopg://orbit:orbit@localhost:5432/orbit_test")
os.environ["ORBIT_DATABASE_URL"] = DATABASE_URL
os.environ.setdefault("ORBIT_JWT_SECRET", "test-secret-that-is-long-enough-for-hs256-signing")

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import get_engine, get_sessionmaker  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402
from app.routers.auth import throttle  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def schema() -> Iterator[None]:
    config = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    config.set_main_option("sqlalchemy.url", DATABASE_URL)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    yield
    get_engine().dispose()


@pytest.fixture(autouse=True)
def clean(schema: None) -> Iterator[None]:
    yield
    tables = ", ".join(table.name for table in Base.metadata.sorted_tables)
    with get_engine().begin() as connection:
        connection.execute(text(f"truncate {tables} cascade"))
    throttle._failures.clear()
    get_settings().allow_signups = False


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db() -> Iterator[Session]:
    with get_sessionmaker()() as session:
        yield session


def sign_up(client: TestClient, email: str = "me@example.com", password: str = "correct horse battery") -> dict:
    get_settings().allow_signups = True
    response = client.post("/auth/sign-up", json={"email": email, "password": password, "timezone": "Asia/Riyadh"})
    assert response.status_code == 201, response.text
    return response.json()


def bearer(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


@pytest.fixture
def me(client: TestClient) -> dict:
    return sign_up(client)


@pytest.fixture
def auth(me: dict) -> dict[str, str]:
    return bearer(me)
