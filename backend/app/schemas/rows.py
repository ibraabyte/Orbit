"""Response shapes built from the table definitions, so the JSON keys match the columns exactly.

The Expo app's types in src/lib/types.ts mirror these columns, which is what lets each hook switch
from supabase-js to this API without reshaping data.
"""

from decimal import Decimal
from functools import cache
from typing import Any

from pydantic import BaseModel, ConfigDict, create_model
from sqlalchemy import inspect

from app.models import Base


class RowModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


@cache
def row_schema(model: type[Base]) -> type[RowModel]:
    fields: dict[str, Any] = {}
    for column in inspect(model).columns:
        python_type = column.type.python_type
        # Postgres numeric arrives as Decimal; the app expects plain JSON numbers.
        if python_type is Decimal:
            python_type = float
        if column.nullable:
            python_type = python_type | None
        fields[column.key] = (python_type, ...)
    return create_model(model.__name__, __base__=RowModel, **fields)
