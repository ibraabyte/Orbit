"""Official papers that expire: national ID, iqama, passport, driving licence, health insurance, visa, or anything else.

One row is one paper and the day it expires. `holder` says whose it is when it isn't the user's own (a family member);
empty means the user's. The number on the paper is never stored. `remind_days` are the heads-ups before the expiry
(0 is the day itself); the phone schedules them itself, like car renewals. Car papers stay on the car (vehicles).
"""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, Index, Integer, Text, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

DOCUMENT_KINDS = ("national_id", "iqama", "passport", "driving_license", "health_insurance", "visa", "other")
MAX_REMINDERS = 4
MAX_REMIND_DAYS = 365

_kinds_sql = ", ".join(f"'{kind}'" for kind in DOCUMENT_KINDS)


class Document(Owned, Base):
    __tablename__ = "documents"
    __table_args__ = (
        CheckConstraint(f"kind in ({_kinds_sql})", name="kind"),
        CheckConstraint("char_length(name) between 1 and 80", name="name_length"),
        CheckConstraint("kind <> 'other' or name is not null", name="other_named"),
        CheckConstraint("char_length(holder) between 1 and 60", name="holder_length"),
        CheckConstraint("char_length(notes) <= 300", name="notes_length"),
        CheckConstraint(f"cardinality(remind_days) between 1 and {MAX_REMINDERS}", name="remind_days_count"),
        CheckConstraint(f"0 <= all(remind_days) and {MAX_REMIND_DAYS} >= all(remind_days)", name="remind_days_range"),
        Index("documents_user_idx", "user_id", "expires_on"),
    )

    kind: Mapped[str] = mapped_column(Text, nullable=False)
    # Shown instead of the kind's own name; required for "other".
    name: Mapped[str | None] = mapped_column(Text)
    # Whose paper it is, when not the user's own, e.g. "Sara".
    holder: Mapped[str | None] = mapped_column(Text)
    expires_on: Mapped[date] = mapped_column(Date, nullable=False)
    remind_days: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, server_default=text("'{30,7,0}'::integer[]"))
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()
