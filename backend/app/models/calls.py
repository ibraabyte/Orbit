"""Phone calls the agent makes for the user (booking an appointment, asking a shop something).

`phone_connections` holds the user's own Twilio account (at most one per user): the account SID, the auth token
(encrypted, never sent back to the app), the number calls go out from (a Twilio number or the user's own verified
mobile) and the realtime voice. The voice AI itself is the user's own OpenAI key, read from Integrations.

`phone_calls` is one call: what the user asked for, the plan shown to them before anything happens (the goal, the
opening line, what the agent may agree to, the name it gives), then the call's progress and its result: the outcome,
the appointment time, a short summary and the words both sides said. Nothing rings until the user approves the plan
(POST /calls/{id}/start). A booked appointment becomes a task; deleting that task keeps the call.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, ForeignKeyConstraint, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, created_at, updated_at

CALL_STATUSES = ("draft", "calling", "in_progress", "ended", "failed", "canceled")
# Still on the line (or about to be): only one of these per user at a time.
ACTIVE_STATUSES = ("calling", "in_progress")
OUTCOMES = ("booked", "not_booked", "needs_you", "no_answer")
# E.164: a plus, the country code and the number. Short codes and emergency numbers can't match.
PHONE_PATTERN = r"^\+[1-9][0-9]{7,14}$"


def _sql_list(values) -> str:
    return ", ".join(f"'{value}'" for value in values)


class PhoneConnection(Base):
    __tablename__ = "phone_connections"
    __table_args__ = (CheckConstraint(f"from_number ~ '{PHONE_PATTERN}'", name="from_number"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    account_sid: Mapped[str] = mapped_column(Text, nullable=False)
    auth_token: Mapped[str] = mapped_column(Text, nullable=False)
    from_number: Mapped[str] = mapped_column(Text, nullable=False)
    voice: Mapped[str] = mapped_column(Text, nullable=False, server_default="marin")
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class PhoneCall(Owned, Base):
    __tablename__ = "phone_calls"
    __table_args__ = (
        CheckConstraint(f"status in ({_sql_list(CALL_STATUSES)})", name="status"),
        CheckConstraint(f"outcome is null or outcome in ({_sql_list(OUTCOMES)})", name="outcome"),
        CheckConstraint(f"to_number ~ '{PHONE_PATTERN}'", name="to_number"),
        CheckConstraint("char_length(business_name) between 1 and 120", name="business_name_length"),
        CheckConstraint("char_length(request) between 1 and 500", name="request_length"),
        CheckConstraint("char_length(goal) between 1 and 500", name="goal_length"),
        CheckConstraint("char_length(opening) between 1 and 300", name="opening_length"),
        # Booked only with a time: the task needs it.
        CheckConstraint("outcome is distinct from 'booked' or appointment_at is not null", name="booked_time"),
        # The booking's task, if one was made. Deleting the task keeps the call.
        ForeignKeyConstraint(["task_id", "user_id"], ["tasks.id", "tasks.user_id"], ondelete="SET NULL (task_id)"),
        Index("phone_calls_user_created_idx", "user_id", text("created_at desc")),
        Index("phone_calls_twilio_sid_idx", "twilio_sid", unique=True, postgresql_where=text("twilio_sid is not null")),
    )

    business_name: Mapped[str] = mapped_column(Text, nullable=False)
    to_number: Mapped[str] = mapped_column(Text, nullable=False)
    # What the user asked for, in their words.
    request: Mapped[str] = mapped_column(Text, nullable=False)
    # The plan the user approves.
    goal: Mapped[str] = mapped_column(Text, nullable=False)
    opening: Mapped[str] = mapped_column(Text, nullable=False)
    allowed: Mapped[str | None] = mapped_column(Text)
    caller_name: Mapped[str | None] = mapped_column(Text)
    task_title: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="draft")
    outcome: Mapped[str | None] = mapped_column(Text)
    appointment_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary: Mapped[str | None] = mapped_column(Text)
    # [{"who": "agent" | "them", "text": ...}] in the order said.
    transcript: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    error: Mapped[str | None] = mapped_column(Text)
    twilio_sid: Mapped[str | None] = mapped_column(Text)
    # sha256 of the one-time key the call's audio stream must show; cleared once the stream is open.
    stream_key: Mapped[str | None] = mapped_column(Text)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = updated_at()
