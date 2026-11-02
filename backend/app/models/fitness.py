"""Exercise library, the user's gym equipment, and their injuries.

`exercises` is a shared catalogue (not owned by anyone), loaded from the open free-exercise-db dataset
(app/data/free_exercise_db.json, public domain). `gym_equipment` and `injuries` belong to one user each and
decide which exercises the app suggests to them (app/services/exercise_catalog.py).
"""

from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, Index, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, Owned, updated_at

# The dataset's equipment values. Exercises with no equipment value need none (mostly stretches).
EQUIPMENT = (
    "barbell",
    "dumbbell",
    "e-z curl bar",
    "kettlebells",
    "cable",
    "machine",
    "bands",
    "medicine ball",
    "exercise ball",
    "foam roll",
    "other",
    "body only",
)
# Always available, so the user never has to pick it.
NO_EQUIPMENT = "body only"
GYM_EQUIPMENT = tuple(item for item in EQUIPMENT if item != NO_EQUIPMENT)

MUSCLES = (
    "abdominals",
    "abductors",
    "adductors",
    "biceps",
    "calves",
    "chest",
    "forearms",
    "glutes",
    "hamstrings",
    "lats",
    "lower back",
    "middle back",
    "neck",
    "quadriceps",
    "shoulders",
    "traps",
    "triceps",
)

# Where an injury can be: a joint or region (mapped to the muscles that load it), or one muscle.
JOINTS: dict[str, tuple[str, ...]] = {
    "neck": ("neck", "traps"),
    "shoulder": ("shoulders",),
    "elbow": ("biceps", "triceps"),
    "wrist": ("forearms",),
    "upper back": ("lats", "middle back", "traps"),
    "lower back": ("lower back",),
    "hip": ("glutes", "abductors", "adductors"),
    "knee": ("quadriceps", "hamstrings"),
    "ankle": ("calves",),
}
INJURY_AREAS: dict[str, tuple[str, ...]] = {**JOINTS, **{muscle: (muscle,) for muscle in MUSCLES if muscle not in JOINTS}}


def _sql_list(values) -> str:
    return ", ".join(f"'{value}'" for value in values)


class Exercise(Base):
    __tablename__ = "exercises"

    # The dataset's own id, e.g. "Barbell_Squat". Stable across dataset updates.
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    level: Mapped[str] = mapped_column(Text, nullable=False)
    force: Mapped[str | None] = mapped_column(Text)
    mechanic: Mapped[str | None] = mapped_column(Text)
    equipment: Mapped[str | None] = mapped_column(Text)
    primary_muscles: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    secondary_muscles: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    instructions: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    # Paths inside the dataset's repository; the API turns them into full image URLs.
    images: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)


class GymEquipment(Owned, Base):
    """One row per kind of equipment the user's gym has."""

    __tablename__ = "gym_equipment"
    __table_args__ = (
        CheckConstraint(f"equipment in ({_sql_list(GYM_EQUIPMENT)})", name="equipment"),
        UniqueConstraint("user_id", "equipment"),
    )

    equipment: Mapped[str] = mapped_column(Text, nullable=False)


class Injury(Owned, Base):
    """While active, exercises that work this area are left out of the user's suggestions."""

    __tablename__ = "injuries"
    __table_args__ = (
        CheckConstraint(f"area in ({_sql_list(INJURY_AREAS)})", name="area"),
        CheckConstraint("char_length(note) <= 500", name="note_length"),
        CheckConstraint("ended_on is null or started_on is null or ended_on >= started_on", name="dates"),
        Index("injuries_user_idx", "user_id", "active", text("created_at desc")),
    )

    area: Mapped[str] = mapped_column(Text, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    started_on: Mapped[date | None] = mapped_column(Date)
    ended_on: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = updated_at()
