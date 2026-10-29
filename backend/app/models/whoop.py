"""WHOOP: the connection (encrypted tokens) and the data the sync copies from WHOOP's API v2.

Rows mirror WHOOP's records, keyed by WHOOP's own id per user, so a re-sync updates in place.
Times are UTC; timezone_offset ("+03:00") is what WHOOP recorded, used to find the local day.
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, created_at, updated_at


class WhoopConnection(Base):
    """One per user. Tokens are encrypted (app.security.encrypt_secret); WHOOP rotates the refresh token on every use."""

    __tablename__ = "whoop_connections"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    whoop_user_id: Mapped[int | None] = mapped_column(BigInteger)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    scope: Mapped[str | None] = mapped_column(Text)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class _WhoopRecord(Owned):
    score_state: Mapped[str] = mapped_column(Text, nullable=False)
    whoop_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class WhoopCycle(_WhoopRecord, Base):
    """A physiological day: from waking to the next sleep. Carries the day's strain and heart rate."""

    __tablename__ = "whoop_cycles"
    __table_args__ = (UniqueConstraint("user_id", "whoop_id"), Index("whoop_cycles_user_start_idx", "user_id", text("start desc")))

    whoop_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    timezone_offset: Mapped[str | None] = mapped_column(Text)
    strain: Mapped[float | None] = mapped_column(Float)
    kilojoule: Mapped[float | None] = mapped_column(Float)
    average_heart_rate: Mapped[int | None] = mapped_column(Integer)
    max_heart_rate: Mapped[int | None] = mapped_column(Integer)


class WhoopRecovery(_WhoopRecord, Base):
    """The morning score for a cycle (0-100), with resting heart rate, HRV, SpO2 and skin temperature."""

    __tablename__ = "whoop_recoveries"
    __table_args__ = (UniqueConstraint("user_id", "cycle_id"),)

    cycle_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sleep_id: Mapped[str | None] = mapped_column(Text)
    recovery_score: Mapped[float | None] = mapped_column(Float)
    resting_heart_rate: Mapped[float | None] = mapped_column(Float)
    hrv_rmssd_milli: Mapped[float | None] = mapped_column(Float)
    spo2_percentage: Mapped[float | None] = mapped_column(Float)
    skin_temp_celsius: Mapped[float | None] = mapped_column(Float)
    user_calibrating: Mapped[bool | None] = mapped_column(Boolean)


class WhoopSleep(_WhoopRecord, Base):
    __tablename__ = "whoop_sleeps"
    __table_args__ = (UniqueConstraint("user_id", "whoop_id"), Index("whoop_sleeps_user_start_idx", "user_id", text("start desc")))

    whoop_id: Mapped[str] = mapped_column(Text, nullable=False)
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone_offset: Mapped[str | None] = mapped_column(Text)
    nap: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    in_bed_milli: Mapped[int | None] = mapped_column(Integer)
    awake_milli: Mapped[int | None] = mapped_column(Integer)
    light_milli: Mapped[int | None] = mapped_column(Integer)
    slow_wave_milli: Mapped[int | None] = mapped_column(Integer)
    rem_milli: Mapped[int | None] = mapped_column(Integer)
    sleep_cycle_count: Mapped[int | None] = mapped_column(Integer)
    disturbance_count: Mapped[int | None] = mapped_column(Integer)
    # baseline + debt + recent strain + recent naps, as WHOOP splits it.
    sleep_need_milli: Mapped[int | None] = mapped_column(Integer)
    respiratory_rate: Mapped[float | None] = mapped_column(Float)
    performance_percentage: Mapped[float | None] = mapped_column(Float)
    consistency_percentage: Mapped[float | None] = mapped_column(Float)
    efficiency_percentage: Mapped[float | None] = mapped_column(Float)


class WhoopWorkout(_WhoopRecord, Base):
    __tablename__ = "whoop_workouts"
    __table_args__ = (UniqueConstraint("user_id", "whoop_id"), Index("whoop_workouts_user_start_idx", "user_id", text("start desc")))

    whoop_id: Mapped[str] = mapped_column(Text, nullable=False)
    start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone_offset: Mapped[str | None] = mapped_column(Text)
    sport_name: Mapped[str | None] = mapped_column(Text)
    strain: Mapped[float | None] = mapped_column(Float)
    average_heart_rate: Mapped[int | None] = mapped_column(Integer)
    max_heart_rate: Mapped[int | None] = mapped_column(Integer)
    kilojoule: Mapped[float | None] = mapped_column(Float)
    distance_meter: Mapped[float | None] = mapped_column(Float)
    # Milliseconds in heart rate zones 0-5.
    zone_durations: Mapped[list[int] | None] = mapped_column(JSONB)


class WhoopInsight(Owned, Base):
    """An AI-written summary of a period, kept so the app shows the last one without calling Claude again."""

    __tablename__ = "whoop_insights"
    __table_args__ = (Index("whoop_insights_user_created_idx", "user_id", text("created_at desc")),)

    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    highlights: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    recommendations: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    model: Mapped[str] = mapped_column(Text, nullable=False)
