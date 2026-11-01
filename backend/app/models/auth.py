import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, updated_at, uuid_pk


class User(Base):
    """Replaces Supabase's auth.users."""

    __tablename__ = "users"
    __table_args__ = (Index("users_lower_email_idx", text("lower(email)"), unique=True),)

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(Text, nullable=False)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    # Admins run the server from the app (sign-ups, private network addresses). The first account is one.
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
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


class ServerSettings(Base):
    """Server-wide switches an admin changes from the app, so running Orbit needs no env var edits.

    Exactly one row (id 1). A missing row means the defaults below.
    """

    __tablename__ = "server_settings"
    __table_args__ = (CheckConstraint("id = 1", name="single_row"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=False, server_default="1")
    signups_open: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    updated_at: Mapped[datetime] = updated_at()
