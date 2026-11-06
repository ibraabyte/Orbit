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
from app.services.tags import tag_target as attach_tags
from app.services.tags import untag_target


def get_owned[M: Base](db: Session, model: type[M], row_id: uuid.UUID, user_id: uuid.UUID) -> M:
    row = db.scalar(select(model).where(model.id == row_id, model.user_id == user_id))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found.")
    return row


def apply_changes(row: Base, changes: BaseModel, skip: tuple[str, ...] = ()) -> None:
    """PATCH semantics: only fields the client sent change, and null clears a field where that's allowed."""
    columns = inspect(type(row)).columns
    for key, value in changes.model_dump(exclude_unset=True, exclude=set(skip)).items():
        if value is None and not columns[key].nullable:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"{key} can't be empty.")
        setattr(row, key, value)


def owned_crud_router(
    model: type[Base],
    *,
    prefix: str,
    create: type[BaseModel],
    update: type[BaseModel] | None,
    order_by: ColumnElement[Any],
    max_limit: int = 500,
    after_create: Callable[..., None] | None = None,
    after_update: Callable[..., None] | None = None,
    tag_target: str | None = None,
    extras: tuple[str, ...] = (),
) -> APIRouter:
    """tag_target: the taggings target_type for this table. Its create body may then carry `tags` (names),
    attached in the same transaction, and deleting a row drops its taggings.
    after_update gets the row and the names of the fields the client sent, before the commit.
    extras: body fields that aren't columns. They are left off the row and handed to after_create / after_update
    as keyword arguments (only the ones the client sent, on an update)."""
    router = APIRouter(prefix=prefix, tags=[prefix.strip("/")])
    Row = row_schema(model)

    @router.get("", response_model=list[Row])
    def list_rows(user_id: UserId, db: Db, limit: int = Query(100, ge=1, le=max_limit), offset: int = Query(0, ge=0)):
        query = select(model).where(model.user_id == user_id).order_by(order_by, model.id).limit(limit).offset(offset)
        return db.scalars(query).all()

    @router.post("", response_model=Row, status_code=status.HTTP_201_CREATED)
    def create_row(body: create, user_id: UserId, db: Db):  # type: ignore[valid-type]
        values = body.model_dump()
        tags = values.pop("tags", [])
        extra = {name: values.pop(name) for name in extras if name in values}
        row = model(**values, user_id=user_id)
        db.add(row)
        if after_create or tags:
            db.flush()
        if after_create:
            after_create(db, row, **extra)
        if tags:
            assert tag_target, f"{model.__name__} can't be tagged."
            attach_tags(db, user_id, tag_target, row.id, tags)
        db.commit()
        db.refresh(row)
        return row

    @router.get("/{row_id}", response_model=Row)
    def get_row(row_id: uuid.UUID, user_id: UserId, db: Db):
        return get_owned(db, model, row_id, user_id)

    if update is not None:

        @router.patch("/{row_id}", response_model=Row)
        def update_row(row_id: uuid.UUID, body: update, user_id: UserId, db: Db):  # type: ignore[valid-type]
            row = get_owned(db, model, row_id, user_id)
            apply_changes(row, body, skip=extras)
            if after_update:
                extra = {name: getattr(body, name) for name in extras if name in body.model_fields_set}
                after_update(row, body.model_fields_set, **extra)
            db.commit()
            db.refresh(row)
            return row

    @router.delete("/{row_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_row(row_id: uuid.UUID, user_id: UserId, db: Db):
        db.delete(get_owned(db, model, row_id, user_id))
        if tag_target:
            untag_target(db, user_id, tag_target, row_id)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router
