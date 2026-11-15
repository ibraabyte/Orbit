import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKeyConstraint, Index, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

TAGGING_TARGETS = ("task", "capture", "meal", "workout", "expense", "bill", "sleep", "meal_plan", "grocery_item")


class Capture(Owned, Base):
    __tablename__ = "captures"
    __table_args__ = (
        CheckConstraint("type in ('link', 'screenshot', 'note', 'image', 'video')", name="type"),
        CheckConstraint("char_length(title) <= 280", name="title_length"),
        CheckConstraint("char_length(category) between 1 and 40", name="category"),
        CheckConstraint("status in ('want', 'done')", name="status"),
        CheckConstraint("char_length(summary) <= 1000", name="summary_length"),
        CheckConstraint("analysis_status in ('none', 'pending', 'done', 'failed', 'no_ai')", name="analysis_status"),
        CheckConstraint("char_length(analysis) <= 4000", name="analysis_length"),
        CheckConstraint("char_length(content_text) <= 8000", name="content_text_length"),
        CheckConstraint("char_length(transcript) <= 8000", name="transcript_length"),
        CheckConstraint("char_length(place) <= 200", name="place_length"),
        CheckConstraint("cardinality(ingredients) <= 40", name="ingredients_count"),
        CheckConstraint("cardinality(labels) <= 20", name="labels_count"),
        UniqueConstraint("id", "user_id"),
        Index("captures_user_created_idx", "user_id", text("created_at desc")),
        Index("captures_user_category_idx", "user_id", "category"),
    )

    type: Mapped[str] = mapped_column(Text, nullable=False, server_default="link")
    url: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str | None] = mapped_column(Text)
    # The saver: "video", "post", "book", "movie", "article", "place", "other", or a name the user made up.
    category: Mapped[str] = mapped_column(Text, nullable=False, server_default="other")
    # "want" = still to see, "done" = seen.
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="want")
    image_url: Mapped[str | None] = mapped_column(Text)
    site_name: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    # The smart saver (services/saver_jobs.py): what the AI saw in it, and the words it can be found by.
    # labels: tags the AI suggested and the user edits. search_terms: words and synonyms (Arabic and English) for search.
    labels: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    analysis: Mapped[str | None] = mapped_column(Text)
    search_terms: Mapped[str | None] = mapped_column(Text)
    # The post's own words: a tweet's text, a video's caption, or text shared on its own.
    content_text: Mapped[str | None] = mapped_column(Text)
    author: Mapped[str | None] = mapped_column(Text)
    # What is said in its video, from the user's own voice model (Integrations > Voice). None without one.
    transcript: Mapped[str | None] = mapped_column(Text)
    # What the AI found to act on: the one place it is about (for a map search) and a recipe's ingredients.
    place: Mapped[str | None] = mapped_column(Text)
    ingredients: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    # none = never analysed (saved before this), pending = working on it, no_ai = no AI connected.
    analysis_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="none")
    analysis_error: Mapped[str | None] = mapped_column(Text)
    # Why no copy of the video or picture was kept (the site refused, too big, too long), shown under the item.
    media_error: Mapped[str | None] = mapped_column(Text)


class Attachment(Owned, Base):
    __tablename__ = "attachments"
    __table_args__ = (
        ForeignKeyConstraint(["capture_id", "user_id"], ["captures.id", "captures.user_id"], ondelete="CASCADE"),
        Index("attachments_user_created_idx", "user_id", text("created_at desc")),
        Index("attachments_capture_idx", "capture_id"),
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
