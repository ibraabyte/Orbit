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


class GoogleStart(BaseModel):
    # The app's own deep link, e.g. orbit://sign-in or exp://192.168.1.5:8081/--/sign-in in Expo Go.
    return_to: str | None = Field(default=None, max_length=512)
    timezone: str = Field(default="UTC", max_length=64)


class GoogleStarted(BaseModel):
    url: str
    # Stays in the app. Only whoever started the sign-in can finish it.
    secret: str


class GoogleFinish(BaseModel):
    code: str = Field(max_length=2048)
    secret: str = Field(max_length=256)
    device: str | None = Field(default=None, max_length=120)


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
    is_admin: bool = False
