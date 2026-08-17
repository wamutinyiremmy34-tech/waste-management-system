import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import UserRole
from app.models.notifications_audit import AuditLog
from app.models.user import User
from app.security.dependencies import require_roles

router = APIRouter(prefix="/admin", tags=["admin"])


class RoleChangeRequest(BaseModel):
    role: UserRole


class DeactivateRequest(BaseModel):
    is_active: bool


@router.get("/users")
def list_users(
    role: UserRole | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    total = q.count()
    items = q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [
            {"id": str(u.id), "email": u.email, "full_name": u.full_name, "role": u.role.value, "is_active": u.is_active}
            for u in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch("/users/{user_id}/role")
def change_role(
    user_id: uuid.UUID,
    payload: RoleChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    old_role = user.role
    user.role = payload.role
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="ROLE_CHANGED",
            entity_type="User",
            entity_id=str(user.id),
            metadata_json={"old_role": old_role.value, "new_role": payload.role.value},
        )
    )
    db.commit()
    return {"status": "ok"}


@router.patch("/users/{user_id}/active")
def set_active(
    user_id: uuid.UUID,
    payload: DeactivateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = payload.is_active
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="USER_DEACTIVATED" if not payload.is_active else "USER_ACTIVATED",
            entity_type="User",
            entity_id=str(user.id),
        )
    )
    db.commit()
    return {"status": "ok"}


@router.get("/audit-logs")
def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    q = db.query(AuditLog).order_by(AuditLog.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [
            {
                "id": str(a.id),
                "actor_user_id": str(a.actor_user_id) if a.actor_user_id else None,
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "metadata": a.metadata_json,
                "created_at": a.created_at.isoformat(),
            }
            for a in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
