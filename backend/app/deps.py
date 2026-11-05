import uuid
from typing import Annotated, Literal

from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.models.integrations import AI_CHOICES
from app.security import decode_access_token

_bearer = HTTPBearer(auto_error=False)

Db = Annotated[Session, Depends(get_db)]


def current_user_id(credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)], db: Db) -> uuid.UUID:
    user_id = decode_access_token(credentials.credentials) if credentials else None
    # A deleted account's unexpired token must stop working too.
    if user_id is None or db.get(User, user_id) is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in.", headers={"WWW-Authenticate": "Bearer"})
    return user_id


UserId = Annotated[uuid.UUID, Depends(current_user_id)]


def current_admin_id(user_id: UserId, db: Db) -> uuid.UUID:
    user = db.get(User, user_id)
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the server's admin can do that.")
    return user_id


AdminId = Annotated[uuid.UUID, Depends(current_admin_id)]


# ?ai=... on an AI request: which of the user's connected AIs to use this time. Left out: their default.
AiPick = Annotated[Literal[AI_CHOICES] | None, Query(alias="ai")]  # type: ignore[valid-type]
