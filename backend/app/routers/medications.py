"""Medications, and answering a dose (taken or skipped) with the stock kept in step.

The medicines themselves are plain owner-scoped rows (/medications). A dose is answered with
POST /medications/{id}/doses for the moment it was due; answering the same moment again changes the answer, and
DELETE /medications/doses/{id} takes it back. Taking a dose takes `per_dose` off the stock (never below zero); a
taken dose that is changed to skipped or taken back puts it back.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.crud import get_owned, owned_crud_router
from app.deps import Db, UserId
from app.models import Medication, MedicationDose
from app.schemas import medications as s

router = APIRouter(prefix="/medications", tags=["medications"])


def _restock(medication: Medication, change: Decimal) -> None:
    if medication.stock is not None:
        medication.stock = max(Decimal(0), Decimal(medication.stock) + change)


@router.get("/doses", response_model=list[s.DoseRow])
def doses(
    user_id: UserId,
    db: Db,
    since: datetime | None = None,
    until: datetime | None = None,
    limit: int = Query(500, ge=1, le=2000),
):
    """Answered doses, newest first."""
    query = select(MedicationDose).where(MedicationDose.user_id == user_id)
    if since is not None:
        query = query.where(MedicationDose.scheduled_at >= since)
    if until is not None:
        query = query.where(MedicationDose.scheduled_at < until)
    return db.scalars(query.order_by(MedicationDose.scheduled_at.desc(), MedicationDose.id).limit(limit)).all()


@router.delete("/doses/{dose_id}", response_model=s.MedicationRow)
def undo(dose_id: uuid.UUID, user_id: UserId, db: Db):
    """Takes an answer back: the dose is open again, and a taken one goes back into the stock."""
    dose = get_owned(db, MedicationDose, dose_id, user_id)
    medication = get_owned(db, Medication, dose.medication_id, user_id)
    if dose.status == "taken":
        _restock(medication, Decimal(medication.per_dose))
    db.delete(dose)
    db.commit()
    db.refresh(medication)
    return medication


@router.post("/{medication_id}/doses", response_model=s.DoseResult)
def answer(medication_id: uuid.UUID, body: s.DoseAnswer, user_id: UserId, db: Db, response: Response):
    medication = get_owned(db, Medication, medication_id, user_id)
    dose = db.scalar(
        select(MedicationDose).where(MedicationDose.medication_id == medication.id, MedicationDose.scheduled_at == body.scheduled_at)
    )
    was_taken = dose is not None and dose.status == "taken"
    if dose is None:
        dose = MedicationDose(user_id=user_id, medication_id=medication.id, scheduled_at=body.scheduled_at)
        db.add(dose)
        response.status_code = status.HTTP_201_CREATED
    dose.status = body.status
    dose.taken_at = body.taken_at or datetime.now(UTC)
    now_taken = body.status == "taken"
    if now_taken != was_taken:
        per_dose = Decimal(medication.per_dose)
        _restock(medication, -per_dose if now_taken else per_dose)
    db.commit()
    db.refresh(dose)
    db.refresh(medication)
    return {"dose": dose, "medication": medication}


def _tidy(row: Medication, fields: set[str]) -> None:
    # Only an "every few hours" schedule keeps its step.
    if "schedule" in fields and row.schedule != "interval":
        row.every_hours = None


medications = owned_crud_router(
    Medication,
    prefix="/medications",
    create=s.MedicationCreate,
    update=s.MedicationUpdate,
    order_by=Medication.created_at.asc(),
    after_update=_tidy,
)

# The fixed /medications/doses paths go first, so "doses" is never read as a medicine's id.
ROUTERS: list[APIRouter] = [router, medications]
