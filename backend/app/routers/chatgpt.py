"""Authenticated, per-user ChatGPT linking; no provider credentials are returned."""

from typing import Literal

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field

from app.deps import Db, UserId
from app.models import ChatgptConnection
from app.services import chatgpt_auth

router = APIRouter(prefix="/integrations/chatgpt", tags=["integrations"])


class ChatgptStatus(BaseModel):
    status: Literal["not_connected", "pending", "connected", "expired"]


class ChatgptStart(ChatgptStatus):
    authorization_url: str


class ChatgptFinish(BaseModel):
    callback_url: str = Field(min_length=1, max_length=8192)


@router.get("", response_model=ChatgptStatus)
def connection_status(user_id: UserId, db: Db):
    return {"status": chatgpt_auth.connection_status(db, user_id)}


@router.post("/start", response_model=ChatgptStart)
def start(user_id: UserId, db: Db):
    return {"status": "pending", "authorization_url": chatgpt_auth.start_login(db, user_id)}


@router.post("/finish", response_model=ChatgptStatus)
def finish(body: ChatgptFinish, user_id: UserId, db: Db):
    try:
        chatgpt_auth.finish_login(db, user_id, body.callback_url)
    except chatgpt_auth.ChatgptExpired as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except chatgpt_auth.ChatgptError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
    return {"status": "connected"}


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(user_id: UserId, db: Db):
    row = db.get(ChatgptConnection, user_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
