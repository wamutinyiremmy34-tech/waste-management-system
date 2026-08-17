import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.enums import UserRole

PHONE_REGEX_HINT = "Use international format, e.g. +2567XXXXXXXX"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=255)
    phone_number: str | None = Field(default=None, max_length=32)
    role: UserRole = UserRole.CITIZEN

    @field_validator("role")
    @classmethod
    def restrict_self_registration_roles(cls, v: UserRole) -> UserRole:
        # Self-service registration is only for CITIZEN and COLLECTOR.
        # Admin-type roles must be provisioned by a SUPER_ADMIN via the
        # admin API, never by public registration.
        allowed = {UserRole.CITIZEN, UserRole.COLLECTOR}
        if v not in allowed:
            raise ValueError(f"Public registration only allows roles: {[r.value for r in allowed]}")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        if not any(c.isalpha() for c in v):
            raise ValueError("Password must contain at least one letter")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    phone_number: str | None
    role: UserRole
    is_active: bool
    is_email_verified: bool
    organization_id: uuid.UUID | None = None
    waste_company_id: uuid.UUID | None = None
    recycler_id: uuid.UUID | None = None

    model_config = {"from_attributes": True}
