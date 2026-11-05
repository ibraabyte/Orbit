"""Food tracking: the user's saved foods, search and barcode lookup, logging a food, a day's totals, and the plate photo.

/foods is the user's own list (create, edit, delete, plus logging one). /food holds the actions that aren't one row:
searching the public databases, reading a barcode, the day view and the photo estimate.
"""

import base64
import binascii
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app import models as m
from app.crud import get_owned, owned_crud_router
from app.deps import AiPick, Db, UserId
from app.schemas import food as s
from app.schemas.rows import row_schema
from app.services import food_photo, food_sources, whoop_ai

foods = owned_crud_router(
    m.Food,
    prefix="/foods",
    create=s.FoodCreate,
    update=s.FoodUpdate,
    order_by=m.Food.last_used_at.desc().nulls_last(),
)
router = APIRouter(prefix="/food", tags=["food"])

FoodRow = row_schema(m.Food)
MealRow = row_schema(m.Meal)
MAX_IMAGE_BYTES = 5 * 1024 * 1024


class DayOut(BaseModel):
    meals: list[MealRow]  # type: ignore[valid-type]
    totals: s.Totals
    targets: s.Targets


def _num(value: Decimal | float | None) -> float | None:
    return None if value is None else float(value)


def _candidate(food: m.Food) -> s.Candidate:
    return s.Candidate(
        source=food.source,
        source_id=food.source_id,
        food_id=food.id,
        name=food.name,
        brand=food.brand,
        barcode=food.barcode,
        serving_label=food.serving_label,
        serving_grams=_num(food.serving_grams),
        calories=float(food.calories),
        protein_g=_num(food.protein_g),
        carbs_g=_num(food.carbs_g),
        fat_g=_num(food.fat_g),
    )


def _mark_saved(db: Session, user_id: uuid.UUID, found: list[s.Candidate]) -> list[s.Candidate]:
    """Results the user saved before point at their saved copy, so the app logs that instead of saving twice."""
    keys = [(c.source, c.source_id) for c in found if c.source_id]
    if not keys:
        return found
    saved = {
        (row.source, row.source_id): row.id
        for row in db.scalars(select(m.Food).where(m.Food.user_id == user_id, m.Food.source_id.in_([key[1] for key in keys])))
    }
    return [c.model_copy(update={"food_id": saved.get((c.source, c.source_id))}) for c in found]


@foods.post("/{food_id}/log", response_model=MealRow, status_code=status.HTTP_201_CREATED)
def log_food(food_id: uuid.UUID, body: s.LogIn, user_id: UserId, db: Db):
    """Logs `servings` of a saved food as a meal. The meal keeps its own copy of the numbers."""
    food = get_owned(db, m.Food, food_id, user_id)
    servings = Decimal(str(body.servings))

    def times(value: Decimal | None) -> Decimal | None:
        return None if value is None else (value * servings).quantize(Decimal("0.1"))

    name = f"{food.name} ({food.brand})" if food.brand else food.name
    meal = m.Meal(
        user_id=user_id,
        name=name[:220],
        calories=int((food.calories * servings).to_integral_value()),
        protein_g=times(food.protein_g),
        carbs_g=times(food.carbs_g),
        fat_g=times(food.fat_g),
        logged_at=body.logged_at,
        food_id=food.id,
        servings=servings,
        meal_type=body.meal_type,
    )
    food.last_used_at = datetime.now(UTC)
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal


@router.get("/search", response_model=s.SearchOut)
def search(user_id: UserId, db: Db, q: str = Query(min_length=2, max_length=100)):
    """The user's own foods first, then USDA basic foods and Open Food Facts products."""
    query = " ".join(q.split())
    pattern = f"%{query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')}%"
    own = db.scalars(
        select(m.Food)
        .where(m.Food.user_id == user_id, or_(m.Food.name.ilike(pattern), m.Food.brand.ilike(pattern)))
        .order_by(m.Food.last_used_at.desc().nulls_last(), m.Food.name)
        .limit(10)
    ).all()
    found, notes = food_sources.search(query)
    own_keys = {(row.source, row.source_id) for row in own if row.source_id}
    found = [c for c in _mark_saved(db, user_id, found) if (c.source, c.source_id) not in own_keys]
    return s.SearchOut(results=[_candidate(row) for row in own] + found, notes=notes)


@router.get("/barcode/{code}", response_model=s.Candidate)
def barcode(code: str, user_id: UserId, db: Db):
    """A scanned barcode: the user's saved food with that code, or the product from Open Food Facts."""
    if not food_sources.BARCODE.match(code):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A barcode is 6 to 14 digits.")
    own = db.scalar(
        select(m.Food).where(m.Food.user_id == user_id, m.Food.barcode == code).order_by(m.Food.last_used_at.desc().nulls_last()).limit(1)
    )
    if own is not None:
        return _candidate(own)
    try:
        found = food_sources.lookup_barcode(code)
    except food_sources.SourceUnavailable as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    if found is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This barcode isn't in Open Food Facts. Add it as your own food.")
    return _mark_saved(db, user_id, [found])[0]


@router.post("/remember", response_model=FoodRow)
def remember(body: s.RememberIn, user_id: UserId, db: Db):
    """Saves a search or barcode result as the user's food, or refreshes the copy saved before."""
    values = body.model_dump()
    row = db.scalar(select(m.Food).where(m.Food.user_id == user_id, m.Food.source == body.source, m.Food.source_id == body.source_id))
    if row is None:
        row = m.Food(user_id=user_id, **values)
        db.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return row


@router.get("/day", response_model=DayOut)
def day(user_id: UserId, db: Db, start: datetime, end: datetime):
    """Meals between start and end (the app sends its local day) with totals and the profile's daily targets."""
    if start.tzinfo is None or end.tzinfo is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "start and end need a time zone.")
    if not start < end <= start + timedelta(hours=49):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Pick a range of up to two days.")
    meals = db.scalars(
        select(m.Meal)
        .where(m.Meal.user_id == user_id, m.Meal.logged_at >= start, m.Meal.logged_at < end)
        .order_by(m.Meal.logged_at, m.Meal.id)
    ).all()
    profile = db.get(m.Profile, user_id)

    def total(key: str) -> float:
        return round(sum(float(getattr(meal, key) or 0) for meal in meals), 1)

    return DayOut(
        meals=meals,
        totals=s.Totals(
            calories=sum(meal.calories for meal in meals), protein_g=total("protein_g"), carbs_g=total("carbs_g"), fat_g=total("fat_g")
        ),
        targets=s.Targets(
            calories=profile.daily_calorie_target if profile else None,
            protein_g=profile.daily_protein_target if profile else None,
            carbs_g=profile.daily_carbs_target if profile else None,
            fat_g=profile.daily_fat_target if profile else None,
        ),
    )


@router.get("/recent", response_model=list[FoodRow])
def recent(user_id: UserId, db: Db, limit: int = Query(12, ge=1, le=50)):
    """Foods logged lately, for one-tap logging again."""
    return db.scalars(
        select(m.Food).where(m.Food.user_id == user_id, m.Food.last_used_at.is_not(None)).order_by(m.Food.last_used_at.desc()).limit(limit)
    ).all()


@router.post("/photo", response_model=s.PhotoOut)
def photo(body: s.PhotoIn, user_id: UserId, db: Db, ai: AiPick = None):
    """A plate photo in, a draft list of foods with estimated calories out. Nothing is saved; the photo isn't kept."""
    access = whoop_ai.access_for(db, user_id, ai)
    if access is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Connect your AI in Integrations first.")
    try:
        size = len(base64.b64decode(body.image, validate=True))
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "That photo couldn't be read. Try again.") from exc
    if size > MAX_IMAGE_BYTES:
        raise HTTPException(status.HTTP_413_CONTENT_TOO_LARGE, "That photo is too big. Try a smaller one.")
    try:
        found, model = food_photo.estimate(body.image, body.media_type, body.note, access)
    except whoop_ai.InsightUnavailable as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    return s.PhotoOut(items=found.items, note=found.note, model=model)
