"""WHOOP: OAuth connect, token handling, sync, the numeric summary and the AI summary, against a fake WHOOP API."""

import uuid
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import httpx2 as httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import User, WhoopConnection, WhoopCycle, WhoopInsight, WhoopRecovery, WhoopSleep, WhoopWorkout
from app.security import decrypt_secret
from app.services import whoop_ai, whoop_analytics, whoop_api, whoop_sync
from tests.conftest import bearer, sign_up

NOW = datetime.now(UTC).replace(microsecond=0)


def iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def make_records(days: int = 10) -> dict[str, list[dict]]:
    """Made-up data: one cycle, recovery, night and workout per day, ending yesterday (UTC)."""
    records: dict[str, list[dict]] = {"/v2/cycle": [], "/v2/recovery": [], "/v2/activity/sleep": [], "/v2/activity/workout": []}
    for index in range(days):
        day_start = (NOW - timedelta(days=days - index)).replace(hour=4, minute=0, second=0)
        cycle_id = 9000 + index
        sleep_id = str(uuid.UUID(int=index + 1))
        strain = 16.0 if index % 3 == 0 else 9.5
        records["/v2/cycle"].append(
            {
                "id": cycle_id, "user_id": 10101, "created_at": iso(day_start), "updated_at": iso(day_start),
                "start": iso(day_start), "end": iso(day_start + timedelta(hours=20)), "timezone_offset": "+03:00",
                "score_state": "SCORED",
                "score": {"strain": strain, "kilojoule": 9000.0, "average_heart_rate": 70, "max_heart_rate": 170},
            }
        )  # fmt: skip
        records["/v2/recovery"].append(
            {
                "cycle_id": cycle_id, "sleep_id": sleep_id, "user_id": 10101, "created_at": iso(day_start),
                "updated_at": iso(day_start), "score_state": "SCORED",
                "score": {"user_calibrating": False, "recovery_score": 40.0 + index * 5, "resting_heart_rate": 58.0,
                          "hrv_rmssd_milli": 45.0 + index, "spo2_percentage": 96.5, "skin_temp_celsius": 33.4},
            }
        )  # fmt: skip
        records["/v2/activity/sleep"].append(
            {
                "id": sleep_id, "user_id": 10101, "created_at": iso(day_start), "updated_at": iso(day_start),
                "start": iso(day_start - timedelta(hours=8)), "end": iso(day_start), "timezone_offset": "+03:00",
                "nap": False, "score_state": "SCORED",
                "score": {
                    "stage_summary": {
                        "total_in_bed_time_milli": 8 * 3_600_000, "total_awake_time_milli": 3_600_000,
                        "total_no_data_time_milli": 0, "total_light_sleep_time_milli": 4 * 3_600_000,
                        "total_slow_wave_sleep_time_milli": 3_600_000, "total_rem_sleep_time_milli": 2 * 3_600_000,
                        "sleep_cycle_count": 4, "disturbance_count": 6,
                    },
                    "sleep_needed": {"baseline_milli": 27_000_000, "need_from_sleep_debt_milli": 1_800_000,
                                     "need_from_recent_strain_milli": 900_000, "need_from_recent_nap_milli": 0},
                    "respiratory_rate": 15.2, "sleep_performance_percentage": 85.0,
                    "sleep_consistency_percentage": 78.0, "sleep_efficiency_percentage": 88.0,
                },
            }
        )  # fmt: skip
        records["/v2/activity/workout"].append(
            {
                "id": str(uuid.UUID(int=1000 + index)), "user_id": 10101, "created_at": iso(day_start),
                "updated_at": iso(day_start), "start": iso(day_start + timedelta(hours=10)),
                "end": iso(day_start + timedelta(hours=10, minutes=45)), "timezone_offset": "+03:00",
                "sport_name": "running" if index % 2 else "functional-fitness", "score_state": "SCORED",
                "score": {"strain": 11.0, "average_heart_rate": 140, "max_heart_rate": 175, "kilojoule": 1800.0,
                          "percent_recorded": 100.0, "distance_meter": 6000.0,
                          "zone_durations": {"zone_zero_milli": 0, "zone_one_milli": 600_000, "zone_two_milli": 900_000,
                                             "zone_three_milli": 600_000, "zone_four_milli": 300_000, "zone_five_milli": 0}},
            }
        )  # fmt: skip
    # One record still being scored: stored, but without numbers.
    records["/v2/recovery"].append(
        {
            "cycle_id": 9999,
            "sleep_id": None,
            "user_id": 10101,
            "created_at": iso(NOW),
            "updated_at": iso(NOW),
            "score_state": "PENDING_SCORE",
        }
    )
    return records


class FakeWhoop:
    """Just enough of WHOOP: token grants with rotating refresh tokens, profile, paginated collections, revoke."""

    def __init__(self) -> None:
        self.records = make_records()
        self.generation = 0
        self.access = ""
        self.refresh = ""
        self.revoked: list[str] = []
        self.requests: list[httpx.Request] = []
        self.fail_paths: set[str] = set()

    def _issue(self) -> httpx.Response:
        self.generation += 1
        self.access, self.refresh = f"access-{self.generation}", f"refresh-{self.generation}"
        body = {
            "access_token": self.access,
            "refresh_token": self.refresh,
            "expires_in": 3600,
            "scope": whoop_api.SCOPES,
            "token_type": "bearer",
        }
        return httpx.Response(200, json=body)

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        url = str(request.url)
        if url == whoop_api.TOKEN_URL:
            form = parse_qs(request.content.decode())
            assert form["client_id"] == ["test-client"] and form["client_secret"] == ["test-secret"]
            if form["grant_type"] == ["authorization_code"]:
                return self._issue() if form["code"] == ["good-code"] else httpx.Response(400, json={"error": "invalid_grant"})
            if form["grant_type"] == ["refresh_token"] and form["refresh_token"] == [self.refresh]:
                return self._issue()
            return httpx.Response(400, json={"error": "invalid_grant"})
        if request.headers.get("Authorization") != f"Bearer {self.access}":
            return httpx.Response(401)
        path = request.url.path.removeprefix("/developer")
        if request.method == "DELETE" and path == "/v2/user/access":
            self.revoked.append(self.access)
            return httpx.Response(204)
        if path == "/v2/user/profile/basic":
            return httpx.Response(200, json={"user_id": 10101, "email": "rider@example.com", "first_name": "Test", "last_name": "Rider"})
        if path in self.fail_paths:
            return httpx.Response(500)
        if path in self.records:
            items = self.records[path]
            offset = int(request.url.params.get("nextToken") or 0)
            page_size = int(request.url.params["limit"])
            next_offset = offset + page_size
            return httpx.Response(
                200, json={"records": items[offset:next_offset], "next_token": str(next_offset) if next_offset < len(items) else None}
            )
        return httpx.Response(404)


@pytest.fixture
def whoop(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeWhoop]:
    fake = FakeWhoop()
    settings = get_settings()
    monkeypatch.setattr(settings, "whoop_client_id", "test-client")
    monkeypatch.setattr(settings, "whoop_client_secret", "test-secret")
    monkeypatch.setattr(settings, "whoop_redirect_uri", "https://api.example.com/whoop/callback")
    monkeypatch.setattr(whoop_api, "transport", httpx.MockTransport(fake))
    monkeypatch.setattr(whoop_api, "PAGE_SIZE", 4)
    yield fake


def connect(client: TestClient, auth: dict) -> httpx.Response:
    url = client.post("/whoop/connect", headers=auth).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    return client.get("/whoop/callback", params={"code": "good-code", "state": state}, follow_redirects=False)


def test_whoop_off_until_configured(client: TestClient, auth: dict):
    assert client.get("/whoop/status", headers=auth).json() == {
        "configured": False, "ai_configured": False, "connected": False, "last_synced_at": None, "last_sync_error": None,
    }  # fmt: skip
    assert client.post("/whoop/connect", headers=auth).status_code == 503
    assert client.post("/whoop/connect").status_code == 401


def test_connect_url_asks_for_offline_access(client: TestClient, auth: dict, whoop: FakeWhoop):
    url = urlparse(client.post("/whoop/connect", headers=auth).json()["url"])
    query = parse_qs(url.query)
    assert f"{url.scheme}://{url.netloc}{url.path}" == whoop_api.AUTH_URL
    assert query["client_id"] == ["test-client"]
    assert query["redirect_uri"] == ["https://api.example.com/whoop/callback"]
    assert set(query["scope"][0].split()) == {"offline", "read:profile", "read:recovery", "read:cycles", "read:sleep", "read:workout"}
    assert len(query["state"][0]) >= 8


def test_connect_stores_encrypted_tokens_and_syncs(client: TestClient, auth: dict, me: dict, whoop: FakeWhoop, db: Session):
    response = connect(client, auth)
    assert response.status_code == 302
    assert response.headers["location"] == "orbit://whoop?status=connected"

    connection = db.get(WhoopConnection, uuid.UUID(me["user_id"]))
    assert connection.whoop_user_id == 10101
    # Never stored as plain text.
    assert "access-1" not in connection.access_token and "refresh-1" not in (connection.refresh_token or "")
    assert decrypt_secret(connection.access_token) == "access-1"
    # The first sync ran after the redirect, through every page.
    assert connection.last_synced_at is not None
    assert len(db.scalars(select(WhoopCycle)).all()) == 10
    assert len(db.scalars(select(WhoopRecovery)).all()) == 11
    assert len(db.scalars(select(WhoopSleep)).all()) == 10
    assert len(db.scalars(select(WhoopWorkout)).all()) == 10
    pending = db.scalar(select(WhoopRecovery).where(WhoopRecovery.cycle_id == 9999))
    assert pending.score_state == "PENDING_SCORE" and pending.recovery_score is None
    workout = db.scalars(select(WhoopWorkout)).first()
    assert workout.zone_durations == [0, 600_000, 900_000, 600_000, 300_000, 0]
    sleep = db.scalars(select(WhoopSleep)).first()
    assert sleep.sleep_need_milli == 29_700_000

    status = client.get("/whoop/status", headers=auth).json()
    assert status["connected"] is True and status["last_sync_error"] is None


def test_callback_returns_to_the_apps_own_link(client: TestClient, auth: dict, whoop: FakeWhoop):
    expo_go = "exp://192.168.1.5:8081/--/whoop"
    url = client.post("/whoop/connect", headers=auth, json={"return_to": expo_go}).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    response = client.get("/whoop/callback", params={"code": "good-code", "state": state}, follow_redirects=False)
    assert response.headers["location"] == f"{expo_go}?status=connected"
    # Never a website: that would make Orbit an open redirect.
    for target in ("https://evil.example.com/", "javascript:alert(1)", "//evil.example.com"):
        assert client.post("/whoop/connect", headers=auth, json={"return_to": target}).status_code == 422


def test_callback_rejects_bad_or_foreign_state(client: TestClient, auth: dict, whoop: FakeWhoop, db: Session):
    bad = client.get("/whoop/callback", params={"code": "good-code", "state": "not-a-state"}, follow_redirects=False)
    assert bad.headers["location"] == "orbit://whoop?status=expired"
    # An access token is not a state, even though it's signed with the same key.
    access_token = sign_up(client, "other@example.com")["access_token"]
    reused = client.get("/whoop/callback", params={"code": "good-code", "state": access_token}, follow_redirects=False)
    assert reused.headers["location"] == "orbit://whoop?status=expired"

    url = client.post("/whoop/connect", headers=auth).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    denied = client.get("/whoop/callback", params={"state": state, "error": "access_denied"}, follow_redirects=False)
    assert denied.headers["location"] == "orbit://whoop?status=denied"
    wrong_code = client.get("/whoop/callback", params={"code": "stolen", "state": state}, follow_redirects=False)
    assert wrong_code.headers["location"] == "orbit://whoop?status=error"
    assert db.scalars(select(WhoopConnection)).all() == []


def test_sync_refreshes_expired_token_and_keeps_the_rotated_one(client: TestClient, auth: dict, me: dict, whoop: FakeWhoop, db: Session):
    connect(client, auth)
    user_id = uuid.UUID(me["user_id"])
    connection = db.get(WhoopConnection, user_id)
    connection.expires_at = NOW - timedelta(minutes=1)
    db.commit()

    synced = client.post("/whoop/sync", headers=auth)
    assert synced.status_code == 200, synced.text
    assert synced.json()["counts"] == {"whoop_cycles": 10, "whoop_recoveries": 11, "whoop_sleeps": 10, "whoop_workouts": 10}
    db.expire_all()
    connection = db.get(WhoopConnection, user_id)
    assert decrypt_secret(connection.refresh_token) == "refresh-2"
    # Re-syncing updates rows in place.
    assert len(db.scalars(select(WhoopCycle)).all()) == 10
    # The later sync only reaches back a week before the last one.
    starts = [r.url.params["start"] for r in whoop.requests if r.url.path.endswith("/v2/cycle")]
    assert datetime.fromisoformat(starts[-1]) > NOW - timedelta(days=8)
    assert datetime.fromisoformat(starts[0]) < NOW - timedelta(days=170)


def test_sync_recovers_from_a_revoked_access_token(client: TestClient, auth: dict, whoop: FakeWhoop):
    connect(client, auth)
    whoop.access = "rotated-by-whoop"  # the stored access token no longer works, the refresh token still does
    assert client.post("/whoop/sync", headers=auth).status_code == 200
    assert whoop.generation == 2


def test_sync_reports_when_whoop_access_is_gone(client: TestClient, auth: dict, me: dict, whoop: FakeWhoop, db: Session):
    connect(client, auth)
    whoop.access, whoop.refresh = "gone", "gone"
    response = client.post("/whoop/sync", headers=auth)
    assert response.status_code == 409
    assert "connected again" in response.json()["detail"]
    status = client.get("/whoop/status", headers=auth).json()
    assert status["connected"] is True and "Connect WHOOP again" in status["last_sync_error"]


def test_sync_failure_keeps_old_data_and_says_why(client: TestClient, auth: dict, whoop: FakeWhoop, db: Session):
    connect(client, auth)
    whoop.fail_paths.add("/v2/activity/sleep")
    response = client.post("/whoop/sync", headers=auth)
    assert response.status_code == 502
    assert len(db.scalars(select(WhoopSleep)).all()) == 10
    assert "500" in client.get("/whoop/status", headers=auth).json()["last_sync_error"]


def test_sync_is_one_at_a_time(client: TestClient, auth: dict, me: dict, whoop: FakeWhoop):
    connect(client, auth)
    with whoop_sync.user_lock(uuid.UUID(me["user_id"])) as acquired:
        assert acquired
        assert client.post("/whoop/sync", headers=auth).status_code == 409


def test_background_sync_picks_up_due_connections(client: TestClient, auth: dict, me: dict, whoop: FakeWhoop, db: Session, monkeypatch):
    connect(client, auth)
    monkeypatch.setattr(get_settings(), "whoop_sync_minutes", 120)
    assert whoop_sync.sync_due() == 0
    assert whoop_sync.sync_due(now=NOW + timedelta(hours=3)) == 1


def test_disconnect_revokes_and_optionally_deletes_data(client: TestClient, auth: dict, whoop: FakeWhoop, db: Session):
    connect(client, auth)
    assert client.delete("/whoop/connection", headers=auth).status_code == 204
    assert whoop.revoked == ["access-1"]
    assert db.scalars(select(WhoopConnection)).all() == []
    assert len(db.scalars(select(WhoopCycle)).all()) == 10

    assert client.delete("/whoop/connection", headers=auth, params={"delete_data": True}).status_code == 204
    for model in (WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout):
        assert db.scalars(select(model)).all() == []


def test_summary_numbers(client: TestClient, auth: dict, whoop: FakeWhoop):
    connect(client, auth)
    data = client.get("/whoop/summary", headers=auth, params={"days": 14}).json()
    assert data["has_data"] is True
    assert len(data["daily"]) == 14 and data["daily"][-1]["date"] == data["end"]

    days = [row for row in data["daily"] if row["recovery"] is not None]
    assert len(days) == 10
    first = days[0]
    assert first["recovery"] == 40.0 and first["recovery_zone"] == "yellow"
    assert first["strain"] == 16.0 and first["resting_hr"] == 58.0
    # 8h in bed minus 1h awake, landing on the morning the cycle started (local time).
    assert first["sleep_hours"] == 7.0 and first["sleep_performance"] == 85.0
    assert first["workouts"] == 1 and first["workout_minutes"] == 45

    assert data["latest"]["recovery"]["value"] == 85.0
    assert data["recovery_zones"] == {"green": 4, "yellow": 6, "red": 0}
    recovery = next(m for m in data["metrics"] if m["key"] == "recovery")
    assert recovery["higher_is_better"] is True and recovery["change"] > 0
    assert data["workouts"]["count"] == 10 and data["workouts"]["minutes"] == 450
    assert {s["sport"] for s in data["workouts"]["by_sport"]} == {"running", "functional-fitness"}
    assert data["strain_vs_recovery"]["high_strain_days"] >= 1


def test_summary_is_private(client: TestClient, auth: dict, whoop: FakeWhoop):
    connect(client, auth)
    other = bearer(sign_up(client, "other@example.com"))
    data = client.get("/whoop/summary", headers=other).json()
    assert data["has_data"] is False
    assert client.get("/whoop/status", headers=other).json()["connected"] is False
    assert client.post("/whoop/sync", headers=other).status_code == 404


def test_local_day_uses_whoop_offset():
    late_utc = datetime(2026, 10, 28, 22, 30, tzinfo=UTC)
    assert whoop_analytics.local_day(late_utc, "+03:00").isoformat() == "2026-10-29"
    assert whoop_analytics.local_day(late_utc, "-05:00").isoformat() == "2026-10-28"
    assert whoop_analytics.local_day(late_utc, None).isoformat() == "2026-10-28"
    assert [whoop_analytics.recovery_zone(v) for v in (67, 66.9, 34, 33)] == ["green", "yellow", "yellow", "red"]


def fake_insight(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    seen: list[dict] = []

    def write(summary: dict):
        seen.append(summary)
        return whoop_ai.Insight(summary="أسبوعك كان جيد.", highlights=["التعافي ارتفع"], recommendations=["نم بدري"]), "claude-opus-5-5"

    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key")
    monkeypatch.setattr(whoop_ai, "write_insight", write)
    return seen


def test_ai_insight_is_written_and_kept(client: TestClient, auth: dict, whoop: FakeWhoop, monkeypatch):
    assert client.post("/whoop/insights", headers=auth).status_code == 503
    seen = fake_insight(monkeypatch)
    assert client.post("/whoop/insights", headers=auth).status_code == 409  # no data yet

    connect(client, auth)
    assert client.get("/whoop/insights/latest", headers=auth).json() is None
    created = client.post("/whoop/insights", headers=auth)
    assert created.status_code == 201, created.text
    assert created.json()["summary"] == "أسبوعك كان جيد."
    assert seen[0]["days"] == 30
    assert client.get("/whoop/insights/latest", headers=auth).json()["id"] == created.json()["id"]
    # One at a time, so a double tap doesn't pay twice.
    assert client.post("/whoop/insights", headers=auth).status_code == 429


def test_write_insight_asks_claude_for_structured_arabic(monkeypatch):
    calls: list[dict] = []

    class Messages:
        def parse(self, **kwargs):
            calls.append(kwargs)
            insight = whoop_ai.Insight(summary="ملخص", highlights=["أ"], recommendations=["ب"])
            return SimpleNamespace(stop_reason="end_turn", parsed_output=insight, model="claude-opus-5-5")

    monkeypatch.setattr(get_settings(), "anthropic_api_key", "test-key")
    monkeypatch.setattr(whoop_ai, "_client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=Messages())))
    insight, model = whoop_ai.write_insight({"start": "2026-10-01", "end": "2026-10-30", "daily": []})
    assert insight.summary == "ملخص" and model == "claude-opus-5-5"
    call = calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_format"] is whoop_ai.Insight
    assert call["fallbacks"] == "default" and call["betas"] == ["server-side-fallback-2026-07-01"]
    assert "Arabic" in call["system"]

    class Refuses:
        def parse(self, **kwargs):
            return SimpleNamespace(stop_reason="refusal", parsed_output=None, model="claude-opus-5-5")

    monkeypatch.setattr(whoop_ai, "_client", lambda: SimpleNamespace(beta=SimpleNamespace(messages=Refuses())))
    with pytest.raises(whoop_ai.InsightUnavailable):
        whoop_ai.write_insight({"start": "2026-10-01", "end": "2026-10-30"})


def test_deleting_the_account_deletes_whoop(client: TestClient, auth: dict, whoop: FakeWhoop, db: Session):
    connect(client, auth)
    db.add(
        WhoopInsight(
            user_id=db.scalars(select(User.id)).one(),
            period_start=NOW.date(),
            period_end=NOW.date(),
            summary="x",
            highlights=[],
            recommendations=[],
            model="m",
        )
    )
    db.commit()
    assert client.post("/auth/delete-account", headers=auth, json={"password": "correct horse battery"}).status_code == 204
    for model in (WhoopConnection, WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout, WhoopInsight):
        assert db.scalars(select(model)).all() == []
