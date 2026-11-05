from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Index, Numeric, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

FOOD_SOURCES = ("custom", "off", "usda", "ai")


class Food(Owned, Base):
    """One food the user has eaten or saved: their own (like a home kabsa) or a copy of a search result.

    Nutrients are for one serving, described by serving_label (and serving_grams when known).
    A copy from Open Food Facts or USDA keeps the source's id so picking it again reuses this row.
    """

    __tablename__ = "foods"
    __table_args__ = (
        CheckConstraint("char_length(name) <= 220", name="name_length"),
        CheckConstraint("source in ('custom', 'off', 'usda', 'ai')", name="source"),
        CheckConstraint("char_length(serving_label) <= 80", name="serving_label_length"),
        CheckConstraint("serving_grams is null or serving_grams > 0", name="serving_grams"),
        CheckConstraint("calories >= 0", name="calories"),
        CheckConstraint("protein_g is null or protein_g >= 0", name="protein_g"),
        CheckConstraint("carbs_g is null or carbs_g >= 0", name="carbs_g"),
        CheckConstraint("fat_g is null or fat_g >= 0", name="fat_g"),
        UniqueConstraint("id", "user_id"),
        Index("foods_user_source_idx", "user_id", "source", "source_id", unique=True, postgresql_where=text("source_id is not null")),
        Index("foods_user_barcode_idx", "user_id", "barcode"),
        Index("foods_user_used_idx", "user_id", text("last_used_at desc nulls last")),
    )

    name: Mapped[str] = mapped_column(Text, nullable=False)
    brand: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="custom")
    source_id: Mapped[str | None] = mapped_column(Text)
    barcode: Mapped[str | None] = mapped_column(Text)
    serving_label: Mapped[str] = mapped_column(Text, nullable=False, server_default="1 serving")
    serving_grams: Mapped[Decimal | None] = mapped_column(Numeric)
    calories: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    protein_g: Mapped[Decimal | None] = mapped_column(Numeric)
    carbs_g: Mapped[Decimal | None] = mapped_column(Numeric)
    fat_g: Mapped[Decimal | None] = mapped_column(Numeric)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = updated_at()
