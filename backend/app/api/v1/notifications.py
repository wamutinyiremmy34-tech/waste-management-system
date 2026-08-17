import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.notifications_audit import Notification, NotificationPreference
from app.models.user import User
from app.security.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])


class PreferenceUpdateRequest(BaseModel):
    in_app_enabled: bool = True
    email_enabled: bool = False
    sms_enabled: bool = False
    push_enabled: bool = False


@router.get("")
def list_notifications(
    unread_only: bool = Query(default=False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read.is_(False))
    total = q.count()
    items = q.order_by(Notification.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [
            {
                "id": str(n.id),
                "type": n.type.value,
                "title": n.title,
                "body": n.body,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch("/{notification_id}/read")
def mark_read(notification_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    n = db.get(Notification, notification_id)
    if not n or n.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"status": "ok"}


@router.put("/preferences")
def update_preferences(
    payload: PreferenceUpdateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    pref = db.query(NotificationPreference).filter(NotificationPreference.user_id == current_user.id).first()
    if not pref:
        pref = NotificationPreference(user_id=current_user.id)
        db.add(pref)
    pref.in_app_enabled = payload.in_app_enabled
    pref.email_enabled = payload.email_enabled
    pref.sms_enabled = payload.sms_enabled
    pref.push_enabled = payload.push_enabled
    db.commit()
    return {"status": "ok"}
