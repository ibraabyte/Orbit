"""Owner-scoped create/read/update/delete, shared by every domain router.

Every query filters by the signed-in user's id, which is what Supabase's row level security did.
A new domain is a few lines: pick the model, its input schemas and a default sort.
"""

import uuid
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response, status
from pydantic import BaseModel
from sqlalchemy import ColumnElement, inspect, select
from sqlalchemy.orm import Session

from app.deps import Db, UserId
from app.models import Base
from app.schemas.rows import row_schema


def get_owned[M: Base](db: Session, model: type[M], row_id: uuid.UUID, user_id: uuid.UUID) -> M:
    row = db.scalar(select(model).where(model.id == row_id, model.user_id == user_id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found.")
    return row


def apply_changes(row: Base, changes: BaseModel) -> None:
    """PATCH semantics: only fields the client sent change, and null clears a field where that's allowed."""
    columns = inspect(type(row)).columns
    for key, value in changes.model_dump(exclude_unset=True).items():
        if value is None and not columns[key].nullable:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{key} can't be empty.")
        setattr(row, key, value)


def owned_crud_router(
    model: type[Base],
    *,
    prefix: str,
    create: type[BaseModel],
    update: type[BaseModel],
    order_by: ColumnElement[Any],
    max_limit: int = 500,
    after_create: Callable[[Session, Any], None] | None = None,
) -> APIRouter:
    router = APIRouter(prefix=prefix, tags=[prefix.strip("/")])
    Row = row_schema(model)

    @router.get("", response_model=list[Row])
    def list_rows(user_id: UserId, db: Db, limit: int = Query(100, ge=1, le=max_limit), offset: int = Query(0, ge=0)):
        query = select(model).where(model.user_id == user_id).order_by(order_by, model.id).limit(limit).offset(offset)
        return db.scalars(query).all()

    @router.post("", response_model=Row, status_code=status.HTTP_201_CREATED)
    def create_row(body: create, user_id: UserId, db: Db):  # type: ignore[valid-type]
        row = model(**body.model_dump(), user_id=user_id)
        db.add(row)
        if after_create:
            db.flush()
            after_create(db, row)
        db.commit()
        db.refresh(row)
        return row

    @router.get("/{row_id}", response_model=Row)
    def get_row(row_id: uuid.UUID, user_id: UserId, db: Db):
        return get_owned(db, model, row_id, user_id)

    @router.patch("/{row_id}", response_model=Row)
    def update_row(row_id: uuid.UUID, body: update, user_id: UserId, db: Db):  # type: ignore[valid-type]
        row = get_owned(db, model, row_id, user_id)
        apply_changes(row, body)
        db.commit()
        db.refresh(row)
        return row

    @router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_row(row_id: uuid.UUID, user_id: UserId, db: Db):
        db.delete(get_owned(db, model, row_id, user_id))
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
