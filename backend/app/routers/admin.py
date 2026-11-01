"""Server-wide settings the admin changes from the app (Settings > Server), instead of env vars in Coolify."""

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.config import get_settings
from app.deps import AdminId, Db
from app.models import ServerSettings

router = APIRouter(prefix="/admin", tags=["admin"])


class ServerSettingsOut(BaseModel):
    signups_open: bool
    # ORBIT_ALLOW_SIGNUPS=true on the server keeps sign-ups open whatever the switch says.
    signups_forced_by_server: bool


class ServerSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    signups_open: bool | None = None


def load(db: Session) -> ServerSettings:
    """The settings row, or the defaults when it hasn't been written yet (not added to the session)."""
    return db.get(ServerSettings, 1) or ServerSettings(id=1, signups_open=False)


def _out(row: ServerSettings) -> ServerSettingsOut:
    return ServerSettingsOut(signups_open=bool(row.signups_open), signups_forced_by_server=get_settings().allow_signups)


@router.get("/settings", response_model=ServerSettingsOut)
def read_settings(_: AdminId, db: Db):
    return _out(load(db))


@router.patch("/settings", response_model=ServerSettingsOut)
def update_settings(body: ServerSettingsUpdate, _: AdminId, db: Db):
    row = db.get(ServerSettings, 1)
    if row is None:
        row = ServerSettings(id=1, signups_open=False)
        db.add(row)
    if body.signups_open is not None:
        row.signups_open = body.signups_open
    db.commit()
    db.refresh(row)
    return _out(row)
