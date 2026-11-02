"""ChatGPT OAuth state and credentials, encrypted for each Orbit user."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_at, updated_at


class ChatgptConnection(Base):
    __tablename__ = "chatgpt_connections"
    __table_args__ = (CheckConstraint("status in ('pending', 'connected', 'expired')", name="status"),)

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    verifier: Mapped[str | None] = mapped_column(Text)
    state: Mapped[str | None] = mapped_column(Text)
    pending_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Includes account id and token expiry, so none of the credential bundle is stored in plain text.
    credentials: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = updated_at()
