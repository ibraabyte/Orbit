"""Tags by name, and the polymorphic taggings that attach them to rows.

A tagging points at any of several tables, so no foreign key can check that its target belongs to the same
user. These helpers check it instead (Supabase did this with a trigger).
"""

import uuid
from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app import models as m

TARGET_MODELS: dict[str, type[m.Base]] = {
    "task": m.Task,
    "capture": m.Capture,
    "meal": m.Meal,
    "workout": m.Workout,
    "expense": m.Expense,
    "bill": m.Bill,
    "sleep": m.SleepLog,
    "focus_session": m.FocusSession,
    "meal_plan": m.MealPlan,
    "grocery_item": m.GroceryItem,
}


def clean_names(names: Iterable[str]) -> list[str]:
    """Trimmed, without a leading #, first spelling wins when two differ only in case."""
    seen: set[str] = set()
    cleaned: list[str] = []
    for raw in names:
        name = raw.strip().removeprefix("#").strip()
        if not name or name.lower() in seen:
            continue
        if len(name) > 60:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A tag can be at most 60 characters.")
        seen.add(name.lower())
        cleaned.append(name)
    return cleaned


def ensure_tags(db: Session, user_id: uuid.UUID, names: Iterable[str]) -> list[m.Tag]:
    """The user's tags with these names (any case), creating the missing ones. Same order as `names`."""
    wanted = clean_names(names)
    if not wanted:
        return []
    lowered = [name.lower() for name in wanted]
    existing = {
        tag.name.lower(): tag for tag in db.scalars(select(m.Tag).where(m.Tag.user_id == user_id, func.lower(m.Tag.name).in_(lowered)))
    }
    for name in wanted:
        if name.lower() not in existing:
            tag = m.Tag(user_id=user_id, name=name)
            db.add(tag)
            existing[name.lower()] = tag
    db.flush()
    return [existing[key] for key in lowered]


def check_target(db: Session, user_id: uuid.UUID, target_type: str, target_id: uuid.UUID) -> None:
    model = TARGET_MODELS[target_type]
    if db.scalar(select(model.id).where(model.id == target_id, model.user_id == user_id)) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That refers to something that doesn't exist.")


def tag_target(db: Session, user_id: uuid.UUID, target_type: str, target_id: uuid.UUID, names: Iterable[str]) -> None:
    tags = ensure_tags(db, user_id, names)
    if not tags:
        return
    check_target(db, user_id, target_type, target_id)
    rows = [{"user_id": user_id, "tag_id": tag.id, "target_type": target_type, "target_id": target_id} for tag in tags]
    db.execute(insert(m.Tagging).values(rows).on_conflict_do_nothing(constraint="taggings_user_id_tag_id_target_type_target_id_key"))


def untag_target(db: Session, user_id: uuid.UUID, target_type: str, target_id: uuid.UUID) -> None:
    db.execute(
        delete(m.Tagging).where(m.Tagging.user_id == user_id, m.Tagging.target_type == target_type, m.Tagging.target_id == target_id)
    )
