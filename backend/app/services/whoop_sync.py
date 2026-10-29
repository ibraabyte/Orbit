"""Copies a user's WHOOP data into Postgres, and keeps doing it in the background.

One sync per user at a time (a Postgres advisory lock), because WHOOP rotates the refresh token on
every refresh: two syncs refreshing at once would leave one holding a dead token.
"""

import logging
import threading
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import or_, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_engine, get_sessionmaker
from app.models import WhoopConnection, WhoopCycle, WhoopRecovery, WhoopSleep, WhoopWorkout
from app.security import decrypt_secret, encrypt_secret
from app.services import whoop_api

log = logging.getLogger("orbit.whoop")

# Scores can change for a few days after a record starts (PENDING_SCORE, late uploads), so each sync re-reads this much.
RESYNC_OVERLAP = timedelta(days=7)
# Refresh a little before WHOOP's expiry so a sync never starts with a token about to die.
EXPIRY_MARGIN = timedelta(minutes=5)


class SyncBusy(Exception):
    pass


class NotConnected(Exception):
    pass


def _dt(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _score(record: dict[str, Any]) -> dict[str, Any]:
    return (record.get("score") or {}) if record.get("score_state") == "SCORED" else {}


def cycle_row(record: dict[str, Any]) -> dict[str, Any]:
    score = _score(record)
    return {
        "whoop_id": record["id"],
        "start": _dt(record["start"]),
        "end": _dt(record.get("end")),
        "timezone_offset": record.get("timezone_offset"),
        "score_state": record["score_state"],
        "strain": score.get("strain"),
        "kilojoule": score.get("kilojoule"),
        "average_heart_rate": score.get("average_heart_rate"),
        "max_heart_rate": score.get("max_heart_rate"),
        "whoop_updated_at": _dt(record.get("updated_at")),
    }


def recovery_row(record: dict[str, Any]) -> dict[str, Any]:
    score = _score(record)
    return {
        "cycle_id": record["cycle_id"],
        "sleep_id": str(record["sleep_id"]) if record.get("sleep_id") is not None else None,
        "score_state": record["score_state"],
        "recovery_score": score.get("recovery_score"),
        "resting_heart_rate": score.get("resting_heart_rate"),
        "hrv_rmssd_milli": score.get("hrv_rmssd_milli"),
        "spo2_percentage": score.get("spo2_percentage"),
        "skin_temp_celsius": score.get("skin_temp_celsius"),
        "user_calibrating": score.get("user_calibrating"),
        "whoop_updated_at": _dt(record.get("updated_at")),
    }


def sleep_row(record: dict[str, Any]) -> dict[str, Any]:
    score = _score(record)
    stages = score.get("stage_summary") or {}
    needed = score.get("sleep_needed") or {}
    need = sum(
        needed.get(key) or 0
        for key in ("baseline_milli", "need_from_sleep_debt_milli", "need_from_recent_strain_milli", "need_from_recent_nap_milli")
    )
    return {
        "whoop_id": str(record["id"]),
        "start": _dt(record["start"]),
        "end": _dt(record["end"]),
        "timezone_offset": record.get("timezone_offset"),
        "nap": bool(record.get("nap")),
        "score_state": record["score_state"],
        "in_bed_milli": stages.get("total_in_bed_time_milli"),
        "awake_milli": stages.get("total_awake_time_milli"),
        "light_milli": stages.get("total_light_sleep_time_milli"),
        "slow_wave_milli": stages.get("total_slow_wave_sleep_time_milli"),
        "rem_milli": stages.get("total_rem_sleep_time_milli"),
        "sleep_cycle_count": stages.get("sleep_cycle_count"),
        "disturbance_count": stages.get("disturbance_count"),
        "sleep_need_milli": need or None,
        "respiratory_rate": score.get("respiratory_rate"),
        "performance_percentage": score.get("sleep_performance_percentage"),
        "consistency_percentage": score.get("sleep_consistency_percentage"),
        "efficiency_percentage": score.get("sleep_efficiency_percentage"),
        "whoop_updated_at": _dt(record.get("updated_at")),
    }


ZONES = ("zone_zero_milli", "zone_one_milli", "zone_two_milli", "zone_three_milli", "zone_four_milli", "zone_five_milli")


def workout_row(record: dict[str, Any]) -> dict[str, Any]:
    score = _score(record)
    zones = score.get("zone_durations") or score.get("zone_duration")
    return {
        "whoop_id": str(record["id"]),
        "start": _dt(record["start"]),
        "end": _dt(record["end"]),
        "timezone_offset": record.get("timezone_offset"),
        "sport_name": record.get("sport_name"),
        "score_state": record["score_state"],
        "strain": score.get("strain"),
        "average_heart_rate": score.get("average_heart_rate"),
        "max_heart_rate": score.get("max_heart_rate"),
        "kilojoule": score.get("kilojoule"),
        "distance_meter": score.get("distance_meter"),
        "zone_durations": [zones.get(key) or 0 for key in ZONES] if zones else None,
        "whoop_updated_at": _dt(record.get("updated_at")),
    }


# path, model, row builder, the unique key besides user_id
COLLECTIONS: list[tuple[str, type, Callable[[dict[str, Any]], dict[str, Any]], str]] = [
    ("/v2/cycle", WhoopCycle, cycle_row, "whoop_id"),
    ("/v2/recovery", WhoopRecovery, recovery_row, "cycle_id"),
    ("/v2/activity/sleep", WhoopSleep, sleep_row, "whoop_id"),
    ("/v2/activity/workout", WhoopWorkout, workout_row, "whoop_id"),
]


def save_tokens(connection: WhoopConnection, tokens: dict[str, Any]) -> None:
    connection.access_token = encrypt_secret(tokens["access_token"])
    # WHOOP sends a new refresh token on every refresh; keep the old one only if none came back.
    if tokens.get("refresh_token"):
        connection.refresh_token = encrypt_secret(tokens["refresh_token"])
    connection.expires_at = datetime.now(UTC) + timedelta(seconds=int(tokens.get("expires_in") or 3600))
    connection.scope = tokens.get("scope") or connection.scope


def _access_token(db: Session, connection: WhoopConnection, force_refresh: bool = False) -> str:
    access = decrypt_secret(connection.access_token)
    if access and not force_refresh and connection.expires_at > datetime.now(UTC) + EXPIRY_MARGIN:
        return access
    refresh = decrypt_secret(connection.refresh_token) if connection.refresh_token else None
    if not refresh:
        raise whoop_api.WhoopAuthError("WHOOP needs to be connected again.")
    save_tokens(connection, whoop_api.refresh_tokens(refresh))
    # Commit right away: the old refresh token is now dead, so losing the new one would lose the connection.
    db.commit()
    return decrypt_secret(connection.access_token) or ""


def _upsert(db: Session, model: type, user_id: uuid.UUID, rows: list[dict[str, Any]], key: str) -> None:
    if not rows:
        return
    values = [{**row, "user_id": user_id} for row in rows]
    statement = insert(model).values(values)
    columns = {name: statement.excluded[name] for name in rows[0] if name != key}
    db.execute(statement.on_conflict_do_update(index_elements=["user_id", key], set_=columns))


@contextmanager
def user_lock(user_id: uuid.UUID) -> Iterator[bool]:
    """Holds a session-level advisory lock on its own connection, so the sync itself can commit freely."""
    with get_engine().connect() as lock_connection:
        key = {"key": f"orbit:whoop:{user_id}"}
        acquired = bool(lock_connection.scalar(text("select pg_try_advisory_lock(hashtextextended(:key, 0))"), key))
        try:
            yield acquired
        finally:
            if acquired:
                lock_connection.execute(text("select pg_advisory_unlock(hashtextextended(:key, 0))"), key)


def sync_user(db: Session, user_id: uuid.UUID) -> dict[str, int]:
    """Pulls new and recently changed records. Returns how many of each came back from WHOOP."""
    with user_lock(user_id) as acquired:
        if not acquired:
            raise SyncBusy
        connection = db.get(WhoopConnection, user_id, populate_existing=True)
        if connection is None:
            raise NotConnected
        now = datetime.now(UTC)
        if connection.last_synced_at:
            since = connection.last_synced_at - RESYNC_OVERLAP
        else:
            since = now - timedelta(days=get_settings().whoop_backfill_days)
        counts: dict[str, int] = {}
        try:
            token = _access_token(db, connection)
            for path, model, build, key in COLLECTIONS:
                try:
                    records = list(whoop_api.collection(token, path, since))
                except whoop_api.WhoopAuthError:
                    # The access token died early (revoked, or WHOOP restarted the session): refresh once and retry.
                    token = _access_token(db, connection, force_refresh=True)
                    records = list(whoop_api.collection(token, path, since))
                rows = [build(record) for record in records]
                _upsert(db, model, user_id, rows, key)
                counts[model.__tablename__] = len(rows)
        except whoop_api.WhoopError as exc:
            db.rollback()
            connection = db.get(WhoopConnection, user_id, populate_existing=True)
            if connection is not None:
                connection.last_sync_error = str(exc)
                db.commit()
            raise
        connection.last_synced_at = now
        connection.last_sync_error = None
        db.commit()
        return counts


def sync_due(now: datetime | None = None) -> int:
    """Syncs every connection whose last sync is older than the interval. Returns how many it synced."""
    minutes = get_settings().whoop_sync_minutes
    cutoff = (now or datetime.now(UTC)) - timedelta(minutes=minutes)
    synced = 0
    with get_sessionmaker()() as db:
        due = db.scalars(
            select(WhoopConnection.user_id).where(or_(WhoopConnection.last_synced_at.is_(None), WhoopConnection.last_synced_at < cutoff))
        ).all()
        for user_id in due:
            try:
                sync_user(db, user_id)
                synced += 1
            except (SyncBusy, NotConnected):
                continue
            except whoop_api.WhoopError as exc:
                log.warning("WHOOP sync failed for one account: %s", exc)
    return synced


def sync_in_background(user_id: uuid.UUID) -> None:
    """For FastAPI BackgroundTasks: the first sync after connecting, with its own session."""
    with get_sessionmaker()() as db:
        try:
            sync_user(db, user_id)
        except (SyncBusy, NotConnected, whoop_api.WhoopError) as exc:
            log.warning("WHOOP first sync didn't finish: %s", exc.__class__.__name__)


class Scheduler:
    """A daemon thread in the API process. With several workers each runs one; the lock and last_synced_at keep work single."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        settings = get_settings()
        if not whoop_api.configured() or settings.whoop_sync_minutes <= 0:
            return
        self._thread = threading.Thread(target=self._run, name="whoop-sync", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)

    def _run(self) -> None:
        # A short first wait so a deploy doesn't sync while the app is still starting.
        wait = 60.0
        while not self._stop.wait(wait):
            try:
                sync_due()
            except Exception:  # noqa: BLE001 - a crash here would silently end background syncing
                log.exception("WHOOP background sync failed")
            wait = 5 * 60.0


scheduler = Scheduler()
