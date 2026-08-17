import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.geo import latlng_from_point, point_from_latlng
from app.models.enums import (
    PICKUP_TRANSITIONS,
    NotificationType,
    PickupStatus,
    UserRole,
)
from app.models.notifications_audit import AuditLog, Notification
from app.models.operations import Collector
from app.models.pickup import Collection, PickupRequest, WasteRecord
from app.models.recycling_rewards import PointsLedgerEntry, RewardRule
from app.models.user import User
from app.schemas.pickup import (
    CollectionCompleteRequest,
    CollectionFailRequest,
    PickupAssignRequest,
    PickupCreateRequest,
)


def _to_out_dict(pickup: PickupRequest) -> dict:
    lat, lng = latlng_from_point(pickup.location)
    return {
        "id": pickup.id,
        "requester_user_id": pickup.requester_user_id,
        "waste_category": pickup.waste_category,
        "status": pickup.status,
        "address_text": pickup.address_text,
        "preferred_date": pickup.preferred_date,
        "preferred_time_window": pickup.preferred_time_window,
        "notes": pickup.notes,
        "assigned_collector_id": pickup.assigned_collector_id,
        "latitude": lat,
        "longitude": lng,
        "created_at": pickup.created_at,
    }


def create_pickup(db: Session, current_user: User, payload: PickupCreateRequest) -> dict:
    pickup = PickupRequest(
        requester_user_id=current_user.id,
        organization_id=current_user.organization_id,
        waste_category=payload.waste_category,
        location=point_from_latlng(payload.latitude, payload.longitude),
        address_text=payload.address_text,
        preferred_date=payload.preferred_date,
        preferred_time_window=payload.preferred_time_window,
        notes=payload.notes,
        status=PickupStatus.REQUESTED,
    )
    db.add(pickup)
    db.flush()
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="PICKUP_REQUESTED",
            entity_type="PickupRequest",
            entity_id=str(pickup.id),
        )
    )
    db.commit()
    db.refresh(pickup)
    return _to_out_dict(pickup)


def get_pickup_or_404(db: Session, pickup_id: uuid.UUID) -> PickupRequest:
    pickup = db.get(PickupRequest, pickup_id)
    if not pickup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pickup not found")
    return pickup


def _authorize_pickup_access(pickup: PickupRequest, current_user: User) -> None:
    """
    Tenant/ownership isolation: a citizen may only see their own pickups; a
    collector may only see pickups assigned to them; company/municipal/super
    admins have broader visibility. This is enforced here, not in the UI.
    """
    if current_user.role == UserRole.SUPER_ADMIN:
        return
    if current_user.role == UserRole.CITIZEN and pickup.requester_user_id == current_user.id:
        return
    if current_user.role == UserRole.COLLECTOR:
        collector = db_get_collector_for_user(current_user)
        if collector and pickup.assigned_collector_id == collector.id:
            return
    if current_user.role in (UserRole.COMPANY_ADMIN, UserRole.MUNICIPAL_ADMIN):
        return  # company/municipal scoping is enforced at the list-query level
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pickup not found")


def db_get_collector_for_user(user: User):
    # Lightweight helper kept here to avoid a circular import with repositories.
    from sqlalchemy.orm import object_session

    session = object_session(user)
    if session is None:
        return None
    return session.query(Collector).filter(Collector.user_id == user.id).first()


def get_pickup(db: Session, pickup_id: uuid.UUID, current_user: User) -> dict:
    pickup = get_pickup_or_404(db, pickup_id)
    _authorize_pickup_access(pickup, current_user)
    return _to_out_dict(pickup)


def list_my_pickups(db: Session, current_user: User, page: int, page_size: int) -> tuple[list[dict], int]:
    query = db.query(PickupRequest).filter(PickupRequest.requester_user_id == current_user.id)
    total = query.count()
    items = (
        query.order_by(PickupRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [_to_out_dict(p) for p in items], total


def list_assigned_pickups(db: Session, current_user: User, page: int, page_size: int) -> tuple[list[dict], int]:
    collector = db.query(Collector).filter(Collector.user_id == current_user.id).first()
    if not collector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No collector profile for this user")
    query = db.query(PickupRequest).filter(PickupRequest.assigned_collector_id == collector.id)
    total = query.count()
    items = (
        query.order_by(PickupRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [_to_out_dict(p) for p in items], total


def _transition(pickup: PickupRequest, new_status: PickupStatus) -> None:
    allowed = PICKUP_TRANSITIONS.get(pickup.status, set())
    if new_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Cannot transition pickup from {pickup.status.value} to {new_status.value}",
        )
    pickup.status = new_status


def assign_pickup(
    db: Session, pickup_id: uuid.UUID, payload: PickupAssignRequest, current_user: User
) -> dict:
    if current_user.role not in (UserRole.COMPANY_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted to assign pickups")

    pickup = get_pickup_or_404(db, pickup_id)
    collector = db.get(Collector, payload.collector_id)
    if not collector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Collector not found")

    if current_user.role == UserRole.COMPANY_ADMIN and collector.waste_company_id != current_user.waste_company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Collector belongs to another company")

    _transition(pickup, PickupStatus.ASSIGNED)
    pickup.assigned_collector_id = collector.id
    pickup.waste_company_id = collector.waste_company_id

    db.add(
        Notification(
            user_id=pickup.requester_user_id,
            type=NotificationType.PICKUP_ASSIGNED,
            title="Your pickup has been assigned",
            body="A collector has been assigned to your pickup request.",
            reference_id=pickup.id,
        )
    )
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="PICKUP_ASSIGNED",
            entity_type="PickupRequest",
            entity_id=str(pickup.id),
            metadata_json={"collector_id": str(collector.id)},
        )
    )
    db.commit()
    db.refresh(pickup)
    return _to_out_dict(pickup)


def update_pickup_status(
    db: Session, pickup_id: uuid.UUID, new_status: PickupStatus, current_user: User
) -> dict:
    pickup = get_pickup_or_404(db, pickup_id)

    if current_user.role == UserRole.CITIZEN:
        if pickup.requester_user_id != current_user.id or new_status != PickupStatus.CANCELLED:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted")
    elif current_user.role == UserRole.COLLECTOR:
        collector = db.query(Collector).filter(Collector.user_id == current_user.id).first()
        if not collector or pickup.assigned_collector_id != collector.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assignment")
    elif current_user.role not in (UserRole.COMPANY_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted")

    _transition(pickup, new_status)
    if new_status == PickupStatus.CANCELLED:
        pickup.cancelled_at = datetime.now(timezone.utc)

    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action=f"PICKUP_STATUS_{new_status.value}",
            entity_type="PickupRequest",
            entity_id=str(pickup.id),
        )
    )
    db.commit()
    db.refresh(pickup)
    return _to_out_dict(pickup)


def complete_collection(
    db: Session, pickup_id: uuid.UUID, payload: CollectionCompleteRequest, current_user: User
) -> Collection:
    if current_user.role != UserRole.COLLECTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only collectors can complete collections")

    pickup = get_pickup_or_404(db, pickup_id)
    collector = db.query(Collector).filter(Collector.user_id == current_user.id).first()
    if not collector or pickup.assigned_collector_id != collector.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assignment")

    _transition(pickup, PickupStatus.COLLECTED)

    location = None
    if payload.latitude is not None and payload.longitude is not None:
        location = point_from_latlng(payload.latitude, payload.longitude)

    collection = Collection(
        pickup_request_id=pickup.id,
        collector_id=collector.id,
        completed_at=datetime.now(timezone.utc),
        collection_location=location,
        quantity_kg=payload.quantity_kg,
        waste_category=payload.waste_category or pickup.waste_category,
        completion_notes=payload.completion_notes,
        was_successful=True,
    )
    db.add(collection)

    db.add(
        WasteRecord(
            source_organization_id=pickup.organization_id,
            waste_company_id=collector.waste_company_id,
            collector_id=collector.id,
            category=payload.waste_category or pickup.waste_category,
            quantity_kg=payload.quantity_kg,
            recorded_at=datetime.now(timezone.utc),
            location=location or pickup.location,
        )
    )

    # Reward the citizen for a completed, verified pickup (configurable rule).
    rule = db.query(RewardRule).filter(RewardRule.activity_type == "VERIFIED_PICKUP", RewardRule.is_active.is_(True)).first()
    if rule:
        db.add(
            PointsLedgerEntry(
                user_id=pickup.requester_user_id,
                activity_type="VERIFIED_PICKUP",
                points=rule.points,
                reference_id=pickup.id,
                note="Verified pickup completed",
            )
        )
        db.add(
            Notification(
                user_id=pickup.requester_user_id,
                type=NotificationType.REWARD_EARNED,
                title=f"You earned {rule.points} points",
                body="Thanks for keeping your community clean!",
                reference_id=pickup.id,
            )
        )

    db.add(
        Notification(
            user_id=pickup.requester_user_id,
            type=NotificationType.COLLECTION_COMPLETED,
            title="Collection completed",
            body=f"{payload.quantity_kg}kg of {(payload.waste_category or pickup.waste_category).value.lower()} waste collected.",
            reference_id=pickup.id,
        )
    )
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="COLLECTION_COMPLETED",
            entity_type="PickupRequest",
            entity_id=str(pickup.id),
        )
    )

    db.commit()
    db.refresh(collection)
    return collection


def fail_collection(
    db: Session, pickup_id: uuid.UUID, payload: CollectionFailRequest, current_user: User
) -> Collection:
    if current_user.role != UserRole.COLLECTOR:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only collectors can report failures")

    pickup = get_pickup_or_404(db, pickup_id)
    collector = db.query(Collector).filter(Collector.user_id == current_user.id).first()
    if not collector or pickup.assigned_collector_id != collector.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assignment")

    _transition(pickup, PickupStatus.FAILED)

    collection = Collection(
        pickup_request_id=pickup.id,
        collector_id=collector.id,
        completed_at=datetime.now(timezone.utc),
        was_successful=False,
        failure_reason=payload.failure_reason,
    )
    db.add(collection)
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="COLLECTION_FAILED",
            entity_type="PickupRequest",
            entity_id=str(pickup.id),
            metadata_json={"reason": payload.failure_reason},
        )
    )
    db.commit()
    db.refresh(collection)
    return collection
