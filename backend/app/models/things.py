from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, Index, Integer, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at


class Vehicle(Owned, Base):
    """Car upkeep: renewal dates (istimara, insurance, inspection / فحص) and the next oil change."""

    __tablename__ = "vehicles"
    __table_args__ = (
        CheckConstraint("char_length(name) <= 120", name="name_length"),
        CheckConstraint("char_length(plate) <= 20", name="plate_length"),
        CheckConstraint("odometer_km >= 0", name="odometer_km"),
        CheckConstraint("next_oil_change_km >= 0", name="next_oil_change_km"),
        Index("vehicles_user_idx", "user_id", "created_at"),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    plate: Mapped[str | None] = mapped_column(Text)
    odometer_km: Mapped[int | None] = mapped_column(Integer)
    registration_expires_at: Mapped[date | None] = mapped_column(Date)
    insurance_expires_at: Mapped[date | None] = mapped_column(Date)
    inspection_expires_at: Mapped[date | None] = mapped_column(Date)
    next_oil_change_at: Mapped[date | None] = mapped_column(Date)
    next_oil_change_km: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()


class WatchItem(Owned, Base):
    """Movies and series to watch, in progress (season/episode reached), or finished. Keyed by TMDB id."""

    __tablename__ = "watch_items"
    __table_args__ = (
        CheckConstraint("media_type in ('movie', 'tv')", name="media_type"),
        CheckConstraint("char_length(title) <= 300", name="title_length"),
        CheckConstraint("status in ('want', 'watching', 'done')", name="status"),
        CheckConstraint("season >= 0", name="season"),
        CheckConstraint("episode >= 0", name="episode"),
        UniqueConstraint("user_id", "media_type", "tmdb_id"),
        Index("watch_items_user_status_idx", "user_id", "status", text("updated_at desc")),
    )

    tmdb_id: Mapped[int] = mapped_column(Integer, nullable=False)
    media_type: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    poster_path: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="want")
    season: Mapped[int | None] = mapped_column(Integer)
    episode: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = updated_at()
