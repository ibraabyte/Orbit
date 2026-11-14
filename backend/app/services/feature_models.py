"""Which of the user's own models each AI feature uses (Integrations > "What each feature uses").

Three kinds of feature:
- "ai": the text features. The choice is one of the AIs they connected (whoop_ai.connected), so a cheap model can
  estimate food while a stronger one runs the assistant. Read through whoop_ai.access_for(..., feature=...).
- "realtime": the live voice call and the phone agent. Both need OpenAI Realtime with their OpenAI key; the choice is
  the realtime model.
- "speech": the assistant's mic. "cloud" sends recordings to their voice model (Integrations > Voice), "phone" keeps
  speech to text on the phone. The phone reads this choice itself.

No saved row means the default, exactly as before this setting existed. A saved choice that is no longer connected
(the key was removed) is kept and reported as stale, and the feature uses the default until it is changed.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import FeatureModel, VoiceConnection
from app.services import voice_call, whoop_ai

AI_FEATURES = ("assistant", "food_text", "food_photo", "health", "week", "saver")
REALTIME_FEATURES = ("call", "phone_agent")
REALTIME_MODELS = ("gpt-realtime", "gpt-realtime-mini")
DEFAULT_REALTIME = REALTIME_MODELS[0]
SPEECH_CHOICES = ("phone", "cloud")
# The ones the app lists, in its order.
SHOWN = (*AI_FEATURES, "speech", "call", "phone_agent")


def kind_of(feature: str) -> str:
    if feature in AI_FEATURES:
        return "ai"
    if feature in REALTIME_FEATURES:
        return "realtime"
    return "speech"


@dataclass(frozen=True)
class FeatureState:
    feature: str
    kind: str
    # What the user saved (None: never picked, so the default).
    choice: str | None
    # What the feature uses right now (None: nothing it could use is connected).
    effective: str | None
    default: str | None
    options: list[str]
    # Saved, but no longer connected: the default is used instead.
    stale: bool


def options(db: Session, user_id: uuid.UUID, feature: str) -> list[str]:
    kind = kind_of(feature)
    if kind == "ai":
        return whoop_ai.connected(db, user_id)
    if kind == "realtime":
        return list(REALTIME_MODELS) if voice_call.call_key(db, user_id) is not None else []
    return ["phone", "cloud"] if db.get(VoiceConnection, user_id) is not None else ["phone"]


def default(db: Session, user_id: uuid.UUID, feature: str) -> str | None:
    kind = kind_of(feature)
    if kind == "ai":
        return whoop_ai.default_choice(db, user_id)
    if kind == "realtime":
        return DEFAULT_REALTIME if voice_call.call_key(db, user_id) is not None else None
    # The mic used the voice model whenever one was connected, so that stays the default.
    return "cloud" if db.get(VoiceConnection, user_id) is not None else "phone"


def states(db: Session, user_id: uuid.UUID, features: tuple[str, ...] = SHOWN) -> list[FeatureState]:
    saved = {row.feature: row.choice for row in db.scalars(select(FeatureModel).where(FeatureModel.user_id == user_id))}
    result = []
    for feature in features:
        allowed = options(db, user_id, feature)
        fallback = default(db, user_id, feature)
        choice = saved.get(feature)
        stale = choice is not None and choice not in allowed
        effective = choice if choice is not None and not stale else fallback
        result.append(FeatureState(feature, kind_of(feature), choice, effective, fallback, allowed, stale))
    return result


def state(db: Session, user_id: uuid.UUID, feature: str) -> FeatureState:
    return states(db, user_id, (feature,))[0]


def realtime_model(db: Session, user_id: uuid.UUID, feature: str) -> str:
    """The realtime model for the voice call or the phone agent: the one saved, else gpt-realtime."""
    row = db.get(FeatureModel, (user_id, feature))
    return row.choice if row is not None and row.choice in REALTIME_MODELS else DEFAULT_REALTIME


def save(db: Session, user_id: uuid.UUID, feature: str, choice: str | None) -> None:
    """Saves one feature's choice; None goes back to the default. The caller checks the choice is in options()."""
    row = db.get(FeatureModel, (user_id, feature))
    if choice is None:
        if row is not None:
            db.delete(row)
    elif row is None:
        db.add(FeatureModel(user_id=user_id, feature=feature, choice=choice))
    else:
        row.choice = choice
    db.commit()
