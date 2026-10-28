import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, uuid_pk


class User(Base):
    """Replaces Supabase's auth.users."""

    __tablename__ = "users"
    __table_args__ = (Index("users_lower_email_idx", text("lower(email)"), unique=True),)

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = created_at()


class RefreshToken(Base):
    """One row per issued refresh token. Only a hash is stored.

    Tokens rotate on every refresh. All tokens from one sign-in share a family_id, so presenting
    an already-used token (a sign it was stolen) revokes the whole family.
    """

    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("refresh_tokens_user_idx", "user_id", "revoked_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    family_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    device: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at()
