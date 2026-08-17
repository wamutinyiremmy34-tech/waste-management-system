import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.pickup import (
    CollectionCompleteRequest,
    CollectionFailRequest,
    CollectionOut,
    PickupAssignRequest,
    PickupCreateRequest,
    PickupOut,
    PickupStatusUpdateRequest,
)
from app.security.dependencies import get_current_user, require_roles
from app.services import pickup_service

router = APIRouter(prefix="/pickups", tags=["pickups"])


@router.post("", response_model=PickupOut, status_code=201)
def request_pickup(
    payload: PickupCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.CITIZEN, UserRole.ORGANIZATION_ADMIN)),
):
    return pickup_service.create_pickup(db, current_user, payload)


@router.get("/mine", response_model=dict)
def my_pickups(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items, total = pickup_service.list_my_pickups(db, current_user, page, page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/assigned", response_model=dict)
def assigned_pickups(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COLLECTOR)),
):
    items, total = pickup_service.list_assigned_pickups(db, current_user, page, page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{pickup_id}", response_model=PickupOut)
def get_pickup(pickup_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return pickup_service.get_pickup(db, pickup_id, current_user)


@router.post("/{pickup_id}/assign", response_model=PickupOut)
def assign_pickup(
    pickup_id: uuid.UUID,
    payload: PickupAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.COMPANY_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN)
    ),
):
    return pickup_service.assign_pickup(db, pickup_id, payload, current_user)


@router.patch("/{pickup_id}/status", response_model=PickupOut)
def update_status(
    pickup_id: uuid.UUID,
    payload: PickupStatusUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return pickup_service.update_pickup_status(db, pickup_id, payload.status, current_user)


@router.post("/{pickup_id}/complete", response_model=CollectionOut, status_code=201)
def complete_collection(
    pickup_id: uuid.UUID,
    payload: CollectionCompleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COLLECTOR)),
):
    return pickup_service.complete_collection(db, pickup_id, payload, current_user)


@router.post("/{pickup_id}/fail", response_model=CollectionOut, status_code=201)
def fail_collection(
    pickup_id: uuid.UUID,
    payload: CollectionFailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COLLECTOR)),
):
    return pickup_service.fail_collection(db, pickup_id, payload, current_user)
