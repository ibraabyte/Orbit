"""Per-user connections to outside services that use an API key: Seerr, the AIs and the voice model.

WHOOP has its own table (OAuth tokens, sync state). Keys here are encrypted (app.security.encrypt_secret), are
never sent back to the app, and go with the account (on delete cascade).
"""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, updated_at

SERVICE_PROVIDERS = ("seerr",)
_providers_sql = ", ".join(f"'{p}'" for p in SERVICE_PROVIDERS)
AI_PROVIDERS = ("anthropic", "openai", "gemini", "openrouter")
_ai_providers_sql = ", ".join(f"'{p}'" for p in AI_PROVIDERS)
# Everything a user can pick: the API-key providers and the ChatGPT account (app/models/chatgpt.py).
AI_CHOICES = ("chatgpt", *AI_PROVIDERS)
# Speech-to-text providers for the assistant's mic (app/services/voice_stt.py).
VOICE_PROVIDERS = ("openai", "groq", "elevenlabs")
_voice_providers_sql = ", ".join(f"'{p}'" for p in VOICE_PROVIDERS)


class ServiceConnection(Base):
    __tablename__ = "service_connections"
    __table_args__ = (CheckConstraint(f"provider in ({_providers_sql})", name="provider"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    provider: Mapped[str] = mapped_column(Text, primary_key=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    # The name the service knows this user by, to show in the app.
    account_name: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class AiConnection(Base):
    """One per user and provider: the AIs they pay for. The key is encrypted and never sent back to the app.
    Which one is used by default is profiles.ai_default (it can also be the ChatGPT account)."""

    __tablename__ = "ai_connections"
    __table_args__ = (CheckConstraint(f"provider in ({_ai_providers_sql})", name="provider"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    provider: Mapped[str] = mapped_column(Text, primary_key=True)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    # Added to the system prompt: what to focus on, the tone, the language.
    instructions: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()


class VoiceConnection(Base):
    """At most one per user: the speech-to-text model the assistant's mic sends recordings to, with the user's own
    key (encrypted, never sent back to the app). No row: the phone turns speech into text itself, as before."""

    __tablename__ = "voice_connections"
    __table_args__ = (CheckConstraint(f"provider in ({_voice_providers_sql})", name="provider"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    api_key: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()
