"""Shapes for official papers and when they expire."""

from datetime import date
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, model_validator

from app.models import Document
from app.models.documents import DOCUMENT_KINDS, MAX_REMIND_DAYS, MAX_REMINDERS
from app.schemas.rows import row_schema
from app.schemas.tasks import Input

DocumentKind = Literal[DOCUMENT_KINDS]  # type: ignore[valid-type]
RemindDay = Annotated[int, Field(ge=0, le=MAX_REMIND_DAYS)]


def _days(value: list[int] | None) -> list[int] | None:
    """Each heads-up once, furthest first, so the same choice is always stored the same way."""
    return None if value is None else sorted(set(value), reverse=True)


RemindDays = Annotated[list[RemindDay], Field(min_length=1, max_length=MAX_REMINDERS), AfterValidator(_days)]


def _text(value: str | None) -> str | None:
    """Spaces around are dropped, and nothing left means not set."""
    if value is None:
        return None
    value = value.strip()
    return value or None


Name = Annotated[str | None, Field(max_length=80), AfterValidator(_text)]
Holder = Annotated[str | None, Field(max_length=60), AfterValidator(_text)]
Notes = Annotated[str | None, Field(max_length=300), AfterValidator(_text)]

DocumentRow = row_schema(Document)


class DocumentCreate(Input):
    kind: DocumentKind
    name: Name = None
    holder: Holder = None
    expires_on: date
    remind_days: RemindDays = [30, 7, 0]
    notes: Notes = None

    @model_validator(mode="after")
    def named(self):
        if self.kind == "other" and self.name is None:
            raise ValueError("Give it a name.")
        return self


class DocumentUpdate(Input):
    kind: DocumentKind | None = None
    name: Name = None
    holder: Holder = None
    expires_on: date | None = None
    remind_days: RemindDays | None = None
    notes: Notes = None
