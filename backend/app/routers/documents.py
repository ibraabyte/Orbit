"""Official papers and when they expire (/documents): plain owner-scoped rows, soonest to expire first.

Renewing one is a PATCH of its expires_on; the phone works out the heads-ups and schedules them itself.
"""

from app.crud import owned_crud_router
from app.models import Document
from app.schemas import documents as s

router = owned_crud_router(
    Document,
    prefix="/documents",
    create=s.DocumentCreate,
    update=s.DocumentUpdate,
    order_by=Document.expires_on.asc(),
)
