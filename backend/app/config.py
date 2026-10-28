from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Everything comes from the environment (Coolify's env vars in production, .env locally)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="ORBIT_", extra="ignore")

    database_url: str = "postgresql+psycopg://orbit:orbit@localhost:5432/orbit"
    # Signs access tokens. Generate with: python -c "import secrets; print(secrets.token_urlsafe(48))"
    jwt_secret: str = Field(min_length=32)
    access_token_minutes: int = 15
    refresh_token_days: int = 60
    # New accounts are refused once one exists, unless this is on. Orbit is a personal app.
    allow_signups: bool = False
    cors_origins: list[str] = []
    # Failed sign-ins allowed per email in the window before answering 429.
    login_attempts: int = 10
    login_window_minutes: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
