from fastapi import APIRouter, HTTPException, status

from app.crud import apply_changes
from app.deps import Db, UserId
from app.models import Profile
from app.schemas.profile import ProfileUpdate
from app.schemas.rows import row_schema

router = APIRouter(prefix="/profile", tags=["profile"])
ProfileRow = row_schema(Profile)


def _profile(db: Db, user_id: UserId) -> Profile:
    profile = db.get(Profile, user_id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile not found.")
    return profile


@router.get("", response_model=ProfileRow)
def get_profile(user_id: UserId, db: Db):
    return _profile(db, user_id)


@router.patch("", response_model=ProfileRow)
def update_profile(body: ProfileUpdate, user_id: UserId, db: Db):
    profile = _profile(db, user_id)
    apply_changes(profile, body)
    db.commit()
    db.refresh(profile)
    return profile
