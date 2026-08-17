"""
Authorization is enforced here, at the API/service boundary — never merely by
hiding frontend buttons (see spec section 8). Every protected endpoint
depends on get_current_user (or require_roles(...)), and tenant-scoped
endpoints additionally call the tenant-isolation helpers in this module.
"""
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import UserRole
from app.models.operations import Collector
from app.models.user import User
from app.security.auth import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def _set_rls_session_context(db: Session, user: User) -> None:
    """
    Sets Postgres session variables (`SET app.*`) that the Row-Level
    Security policies in app/core/rls.py read via `current_setting(...)`.
    This is a real defense-in-depth mechanism, not just an access-control
    convenience: even if some future endpoint forgets an application-layer
    tenant filter, a connection using the restricted `ecotrack_app` role
    (see docs/multi-tenancy.md for how to enable it) still can't return
    cross-tenant rows, because the database itself enforces it.

    Harmless no-op when the app's DATABASE_URL connects as a superuser (the
    shipped default for local development) — Postgres superusers bypass RLS
    unconditionally, so these SET calls simply have nothing to affect.

    Uses plain `SET` (session-scoped), not `SET LOCAL` (transaction-scoped).
    An earlier version used `SET LOCAL` and a real bug was found by testing
    the RLS-restricted role end-to-end: several service functions commit
    partway through a request and then run further RLS-covered queries
    afterward (e.g. pickup_service.create_pickup commits, then calls
    db.refresh() — which failed to find the very row just inserted, because
    `SET LOCAL`'s context had already ended with the commit). `SET`
    (session-scoped) survives commits within the same connection, fixing
    this — paired with a connection-pool `checkin` event
    (app/core/database.py) that runs `RESET ALL` whenever a connection
    returns to the pool, so this session-scoped context can never leak into
    a later, unrelated request that happens to reuse the same pooled
    connection.

    Known ordering subtlety, found by testing this exact code path end-to-end
    (not assumed): the collector-id lookup below queries the `collectors`
    table, which itself has RLS (see app/core/rls.py). If that lookup ran
    before any `app.*` context was set on this connection, the
    `collectors_access` policy's `user_id = app.user_id` clause would never
    match (nothing set yet), so the lookup would silently return zero rows
    even for a real collector — breaking every subsequent
    `assigned_collector_id = app.collector_id` check for that collector's
    own real assignments. Fixed by setting `app.user_id`/`app.role` FIRST
    (sufficient on their own to satisfy the collectors policy's own-row
    clause), then performing the lookup, then setting the remaining
    variables including the now-correctly-resolved `app.collector_id`.
    """
    db.execute(text("SET app.user_id = :v"), {"v": str(user.id)})
    db.execute(text("SET app.role = :v"), {"v": user.role.value})

    collector_id = None
    if user.role == UserRole.COLLECTOR:
        collector = db.query(Collector).filter(Collector.user_id == user.id).first()
        collector_id = collector.id if collector else None

    db.execute(text("SET app.company_id = :v"), {"v": str(user.waste_company_id) if user.waste_company_id else ""})
    db.execute(text("SET app.collector_id = :v"), {"v": str(collector_id) if collector_id else ""})
    db.execute(text("SET app.org_id = :v"), {"v": str(user.organization_id) if user.organization_id else ""})
    db.execute(text("SET app.recycler_id = :v"), {"v": str(user.recycler_id) if user.recycler_id else ""})


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = payload.get("sub")
    user = db.get(User, uuid.UUID(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")
    _set_rls_session_context(db, user)
    return user


def require_roles(*roles: UserRole):
    """Dependency factory: 403s unless current_user.role is one of `roles`."""

    def dependency(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{current_user.role.value}' is not permitted to perform this action",
            )
        return current_user

    return dependency


def require_same_organization(organization_id: uuid.UUID, current_user: User) -> None:
    """
    Tenant isolation check: a non-super-admin user may only touch data that
    belongs to their own organization. Raises 403/404 (never leaks existence
    of another tenant's data by distinguishing the two).
    """
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.organization_id != organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")


def require_same_waste_company(waste_company_id: uuid.UUID, current_user: User) -> None:
    if current_user.role in (UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN):
        return
    if current_user.waste_company_id != waste_company_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Resource not found")
