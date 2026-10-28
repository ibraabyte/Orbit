import uuid

from pydantic import BaseModel, EmailStr, Field


class SignUp(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=256)
    display_name: str | None = Field(default=None, max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    device: str | None = Field(default=None, max_length=120)


class SignIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=256)
    device: str | None = Field(default=None, max_length=120)


class Refresh(BaseModel):
    refresh_token: str = Field(max_length=256)


class ChangePassword(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class Tokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    user_id: uuid.UUID


class Me(BaseModel):
    id: uuid.UUID
    email: str
