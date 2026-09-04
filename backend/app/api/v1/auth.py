import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import PasswordResetToken, User
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from app.security.auth import hash_password, hash_token
from app.security.dependencies import get_current_user
from app.services import auth_service

logger = logging.getLogger("ecotrack.auth")

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    user = auth_service.register_user(db, payload)
    return user


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    access_token, refresh_token = auth_service.login(db, payload)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    access_token, refresh_token = auth_service.refresh_access_token(db, payload.refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/logout", status_code=204)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)):
    auth_service.logout(db, payload.refresh_token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ---------------------------------------------------------------------------
# Password reset (pilot-grade: token returned in response; no email wired)
# ---------------------------------------------------------------------------
_RESET_TOKEN_EXPIRY_MINUTES = 30


class PasswordResetRequestPayload(BaseModel):
    email: EmailStr


class PasswordResetConfirmPayload(BaseModel):
    token: str
    new_password: str


@router.post("/password-reset/request", status_code=200)
def request_password_reset(payload: PasswordResetRequestPayload, db: Session = Depends(get_db)):
    """
    Initiates a password reset. For the pilot, the reset token is returned
    directly in the response so an administrator can communicate it manually
    to the user. In production with email, this endpoint would send the token
    by email and return only {"status": "ok"} — the response body change is
    the only thing that needs updating when email is wired.

    Always returns 200 (never 404 on unknown email) to prevent user
    enumeration attacks.
    """
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not user.is_active:
        # Do not reveal whether the email exists — return 200 regardless.
        logger.info("Password reset requested for unknown/inactive email=%s", payload.email.lower())
        return {"status": "ok", "note": "If the address is registered, a reset token has been issued."}

    raw_token = secrets.token_urlsafe(32)
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(raw_token),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=_RESET_TOKEN_EXPIRY_MINUTES),
        )
    )
    db.commit()
    logger.info("Password reset token issued user_id=%s", str(user.id))

    # Pilot-only: return the token in the response so an admin can relay it.
    # When email is wired, remove the `reset_token` field and send by email instead.
    return {
        "status": "ok",
        "note": "Email delivery is not configured in this pilot. Share this token securely with the user.",
        "reset_token": raw_token,
        "expires_in_minutes": _RESET_TOKEN_EXPIRY_MINUTES,
    }


@router.post("/password-reset/confirm", status_code=200)
def confirm_password_reset(payload: PasswordResetConfirmPayload, db: Session = Depends(get_db)):
    """
    Completes a password reset. Validates the token, sets the new password,
    and invalidates all existing refresh tokens for the user (force re-login).
    """
    from app.models.user import RefreshToken  # avoid circular import at module level
    from app.schemas.auth import RegisterRequest  # reuse password validator

    # Validate password strength using the same rules as registration.
    try:
        RegisterRequest(
            email="placeholder@example.com",
            password=payload.new_password,
            full_name="placeholder",
        )
    except Exception:
        raise HTTPException(status_code=422, detail="Password does not meet strength requirements")

    token_hash = hash_token(payload.token)
    token_row = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == token_hash).first()
    if (
        not token_row
        or token_row.used
        or token_row.expires_at < datetime.now(timezone.utc)
    ):
        logger.warning("Invalid or expired password reset token presented")
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = db.get(User, token_row.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user.hashed_password = hash_password(payload.new_password)
    token_row.used = True

    # Revoke all existing refresh tokens — force re-authentication with the new password.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id, RefreshToken.revoked.is_(False)).update(
        {"revoked": True}
    )
    db.commit()
    logger.info("Password reset completed user_id=%s", str(user.id))
    return {"status": "ok", "message": "Password updated. Please log in with your new password."}
