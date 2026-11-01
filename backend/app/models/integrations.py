"""Per-user connections to outside services that use a URL and an API key (Seerr today).

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
