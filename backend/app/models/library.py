import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKeyConstraint, Index, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

TAGGING_TARGETS = ("task", "capture", "meal", "workout", "expense", "bill", "sleep", "focus_session", "meal_plan", "grocery_item")


class Capture(Owned, Base):
    __tablename__ = "captures"
    __table_args__ = (
        CheckConstraint("type in ('link', 'screenshot', 'note')", name="type"),
        CheckConstraint("char_length(title) <= 280", name="title_length"),
        UniqueConstraint("id", "user_id"),
        Index("captures_user_created_idx", "user_id", text("created_at desc")),
    )

    type: Mapped[str] = mapped_column(Text, nullable=False, server_default="link")
    url: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(Text)


class Attachment(Owned, Base):
    __tablename__ = "attachments"
    __table_args__ = (
        ForeignKeyConstraint(["capture_id", "user_id"], ["captures.id", "captures.user_id"], ondelete="CASCADE"),
        Index("attachments_user_created_idx", "user_id", text("created_at desc")),
    )

    capture_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    bucket: Mapped[str] = mapped_column(Text, nullable=False)
    object_path: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(Text)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)


class Tag(Owned, Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        Index("tags_user_lower_name_idx", "user_id", text("lower(name)"), unique=True),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str | None] = mapped_column(Text)


class Tagging(Owned, Base):
    """Polymorphic link, so target ownership is checked in the API rather than by a foreign key."""

    __tablename__ = "taggings"
    __table_args__ = (
        CheckConstraint("target_type in (" + ", ".join(f"'{t}'" for t in TAGGING_TARGETS) + ")", name="target_type"),
        ForeignKeyConstraint(["tag_id", "user_id"], ["tags.id", "tags.user_id"], ondelete="CASCADE"),
        UniqueConstraint("user_id", "tag_id", "target_type", "target_id"),
        Index("taggings_user_created_idx", "user_id", text("created_at desc")),
        Index("taggings_target_idx", "user_id", "target_type", "target_id"),
    )

    tag_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)


class PushSubscription(Owned, Base):
    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "endpoint"),)

    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()
