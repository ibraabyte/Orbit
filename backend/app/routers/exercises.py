"""Exercise library search, the user's gym equipment, and their injuries.

GET /exercises searches the shared catalogue. With only_my_gym it keeps exercises the user's gym can do, and it
always leaves out exercises whose main muscle is under an active injury unless include_injured is set. The
rules are in app/services/exercise_catalog.py.
"""

from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import ColumnElement, delete, func, not_, or_, select
from sqlalchemy.orm import Session

from app.crud import owned_crud_router
from app.deps import Db, UserId
from app.models import Exercise, GymEquipment, Injury
from app.models.fitness import EQUIPMENT, MUSCLES, NO_EQUIPMENT
from app.schemas import fitness as s
from app.services import exercise_catalog as catalog

router = APIRouter(prefix="/exercises", tags=["exercises"])
gym_router = APIRouter(prefix="/gym", tags=["gym"])
injuries = owned_crud_router(Injury, prefix="/injuries", create=s.InjuryCreate, update=s.InjuryUpdate, order_by=Injury.created_at.desc())


def _gym(db: Session, user_id) -> list[str]:
    return list(db.scalars(select(GymEquipment.equipment).where(GymEquipment.user_id == user_id).order_by(GymEquipment.equipment)))


def _covered(db: Session, user_id) -> dict[str, list[str]]:
    areas = db.scalars(select(Injury.area).where(Injury.user_id == user_id, Injury.active).order_by(Injury.created_at))
    return catalog.muscles_for(list(areas))


def _fits_gym(gym: list[str]) -> ColumnElement[bool]:
    return or_(Exercise.equipment.is_(None), Exercise.equipment.in_([NO_EQUIPMENT, *gym]))


def _summary(exercise: Exercise, covered: dict[str, list[str]]) -> dict[str, Any]:
    avoid, caution = catalog.conflicts(exercise.primary_muscles, exercise.secondary_muscles, covered)
    return {
        "id": exercise.id,
        "name": exercise.name,
        "category": exercise.category,
        "level": exercise.level,
        "equipment": exercise.equipment,
        "force": exercise.force,
        "mechanic": exercise.mechanic,
        "primary_muscles": exercise.primary_muscles,
        "secondary_muscles": exercise.secondary_muscles,
        "image_url": catalog.image_url(exercise.images[0]) if exercise.images else None,
        "avoid": avoid,
        "caution": caution,
    }


def _count(db: Session, conditions: list[ColumnElement[bool]]) -> int:
    return db.scalar(select(func.count()).select_from(Exercise).where(*conditions)) or 0


@router.get("", response_model=s.ExerciseSearch)
def search(
    user_id: UserId,
    db: Db,
    q: str | None = Query(None, max_length=100, description="Words in the exercise name."),
    muscle: str | None = Query(None, description="Main muscle worked."),
    equipment: str | None = None,
    category: str | None = None,
    level: str | None = None,
    only_my_gym: bool = False,
    include_injured: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    if muscle is not None and muscle not in MUSCLES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown muscle.")
    if equipment is not None and equipment not in EQUIPMENT:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Unknown equipment.")

    base: list[ColumnElement[bool]] = []
    for word in (q or "").split():
        escaped = word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        base.append(Exercise.name.ilike(f"%{escaped}%", escape="\\"))
    if muscle:
        base.append(Exercise.primary_muscles.contains([muscle]))
    if equipment == NO_EQUIPMENT:
        base.append(or_(Exercise.equipment.is_(None), Exercise.equipment == NO_EQUIPMENT))
    elif equipment:
        base.append(Exercise.equipment == equipment)
    if category:
        base.append(Exercise.category == category)
    if level:
        base.append(Exercise.level == level)

    hidden_by_gym = 0
    if only_my_gym:
        fits = _fits_gym(_gym(db, user_id))
        hidden_by_gym = _count(db, [*base, not_(fits)])
        base.append(fits)

    covered = _covered(db, user_id)
    hidden_by_injuries = 0
    if covered and not include_injured:
        hurts = Exercise.primary_muscles.overlap(list(covered))
        hidden_by_injuries = _count(db, [*base, hurts])
        base.append(not_(hurts))

    rows = db.scalars(select(Exercise).where(*base).order_by(Exercise.name, Exercise.id).limit(limit).offset(offset)).all()
    return {
        "items": [_summary(row, covered) for row in rows],
        "total": _count(db, base),
        "hidden_by_gym": hidden_by_gym,
        "hidden_by_injuries": hidden_by_injuries,
    }


@router.get("/{exercise_id}", response_model=s.ExerciseDetail)
def detail(exercise_id: str, user_id: UserId, db: Db):
    exercise = db.get(Exercise, exercise_id)
    if exercise is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Exercise not found.")
    gym = _gym(db, user_id)
    return {
        **_summary(exercise, _covered(db, user_id)),
        "instructions": exercise.instructions,
        "image_urls": [catalog.image_url(path) for path in exercise.images],
        "in_my_gym": exercise.equipment in (None, NO_EQUIPMENT, *gym),
    }


def _gym_out(db: Session, user_id) -> dict[str, list[str]]:
    return {"equipment": _gym(db, user_id), "always": [NO_EQUIPMENT]}


@gym_router.get("/equipment", response_model=s.GymEquipmentOut)
def get_gym(user_id: UserId, db: Db):
    return _gym_out(db, user_id)


@gym_router.put("/equipment", response_model=s.GymEquipmentOut)
def set_gym(body: s.GymEquipmentIn, user_id: UserId, db: Db):
    """Replaces the whole list with what the user ticked."""
    db.execute(delete(GymEquipment).where(GymEquipment.user_id == user_id))
    db.add_all(GymEquipment(user_id=user_id, equipment=item) for item in dict.fromkeys(body.equipment))
    db.commit()
    return _gym_out(db, user_id)


ROUTERS: list[APIRouter] = [router, gym_router, injuries]
