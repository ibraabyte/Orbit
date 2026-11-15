"""Orders on their way: one row per tracking number the user follows.

A shipment comes from the user (they typed or pasted the number) or from a shipping email in their linked Gmail. Orbit
asks the user's own 17TRACK account about it (app/services/tracking_api.py) and keeps the latest status, the last few
events and the expected delivery day. `alert_seen` is the last alert the app already showed for it, so "delivered" or
"late" is announced once, not on every refresh.
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

# Our names for 17TRACK's main states, plus "pending" (not asked yet: no key, or waiting for the first answer).
SHIPMENT_STATUSES = (
    "pending",
    "not_found",
    "info_received",
    "in_transit",
    "out_for_delivery",
    "pickup",
    "delivered",
    "failed",
    "exception",
    "expired",
)
SHIPMENT_SOURCES = ("manual", "email")
MAX_EVENTS = 30

_statuses_sql = ", ".join(f"'{s}'" for s in SHIPMENT_STATUSES)
_sources_sql = ", ".join(f"'{s}'" for s in SHIPMENT_SOURCES)


class Shipment(Owned, Base):
    __tablename__ = "shipments"
    __table_args__ = (
        CheckConstraint(f"status in ({_statuses_sql})", name="status"),
        CheckConstraint(f"source in ({_sources_sql})", name="source"),
        CheckConstraint("char_length(number) between 5 and 40", name="number_length"),
        CheckConstraint("char_length(label) <= 80", name="label_length"),
        CheckConstraint("char_length(store) <= 80", name="store_length"),
        UniqueConstraint("user_id", "number"),
        Index("shipments_user_archived_idx", "user_id", "archived"),
    )

    # Upper case, no spaces or dashes.
    number: Mapped[str] = mapped_column(Text, nullable=False)
    # What it is, in the user's words ("New headphones").
    label: Mapped[str | None] = mapped_column(Text)
    # Who sent it, from the email's sender ("Amazon", "Noon").
    store: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="manual")
    # The Gmail message it came from, so the same email never adds it twice.
    email_id: Mapped[str | None] = mapped_column(Text)
    # 17TRACK's carrier number and the carrier's name; empty until 17TRACK has detected it.
    carrier_code: Mapped[int | None] = mapped_column(Integer)
    carrier_name: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    sub_status: Mapped[str | None] = mapped_column(Text)
    last_event: Mapped[str | None] = mapped_column(Text)
    last_location: Mapped[str | None] = mapped_column(Text)
    last_event_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The latest day the carrier expects to deliver.
    eta_on: Mapped[date | None] = mapped_column(Date)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Newest first: [{"at": iso, "text": str, "place": str | None}], at most MAX_EVENTS.
    events: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    # True once 17TRACK accepted the number (that uses one of the account's tracking credits).
    registered: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error: Mapped[str | None] = mapped_column(Text)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    alert_seen: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()


class ShipmentScan(Base):
    """Per user: when Orbit last looked through Gmail for shipping emails, and last asked 17TRACK."""

    __tablename__ = "shipment_scans"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    emails_read: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    email_error: Mapped[str | None] = mapped_column(Text)
    refreshed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # What 17TRACK said last time it failed for the whole account (wrong key, no credits left).
    tracking_error: Mapped[str | None] = mapped_column(Text)
