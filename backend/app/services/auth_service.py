from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.notifications_audit import AuditLog
from app.models.user import RefreshToken, User
from app.schemas.auth import LoginRequest, RegisterRequest
from app.security.auth import (
    create_access_token,
    create_raw_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)


def register_user(db: Session, payload: RegisterRequest) -> User:
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        full_name=payload.full_name,
        phone_number=payload.phone_number,
        role=payload.role,
    )
    db.add(user)
    db.flush()
    db.add(AuditLog(actor_user_id=user.id, action="USER_REGISTERED", entity_type="User", entity_id=str(user.id)))
    db.commit()
    db.refresh(user)
    return user


def _issue_tokens(db: Session, user: User) -> tuple[str, str]:
    access_token = create_access_token(subject=str(user.id), role=user.role.value)
    raw_refresh = create_raw_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw_refresh),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        )
    )
    db.commit()
    return access_token, raw_refresh


def login(db: Session, payload: LoginRequest) -> tuple[str, str]:
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    access_token, raw_refresh = _issue_tokens(db, user)
    db.add(AuditLog(actor_user_id=user.id, action="USER_LOGIN", entity_type="User", entity_id=str(user.id)))
    db.commit()
    return access_token, raw_refresh


def refresh_access_token(db: Session, raw_refresh_token: str) -> tuple[str, str]:
    token_hash = hash_token(raw_refresh_token)
    token_row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if not token_row or token_row.revoked or token_row.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token")

    user = db.get(User, token_row.user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")

    # Rotate: revoke the old refresh token, issue a new pair.
    token_row.revoked = True
    db.commit()
    access_token, raw_refresh = _issue_tokens(db, user)
    return access_token, raw_refresh


def logout(db: Session, raw_refresh_token: str) -> None:
    token_hash = hash_token(raw_refresh_token)
    token_row = db.query(RefreshToken).filter(RefreshToken.token_hash == token_hash).first()
    if token_row:
        token_row.revoked = True
        db.commit()
