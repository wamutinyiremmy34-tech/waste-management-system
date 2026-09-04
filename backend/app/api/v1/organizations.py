import secrets
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.geo import point_from_latlng
from app.models.enums import OrganizationType, UserRole
from app.models.notifications_audit import AuditLog
from app.models.pickup import WasteRecord
from app.models.tenant import Organization, OrganizationLocation
from app.models.user import User
from app.security.auth import hash_password
from app.security.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/organizations", tags=["organizations"])


class OrganizationCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    org_type: OrganizationType
    contact_email: str | None = None
    contact_phone: str | None = None
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address_text: str | None = None


class LocationCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=255)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    address_text: str | None = None


class StaffCreateRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    phone_number: str | None = Field(default=None, max_length=32)


@router.post("", status_code=201)
def create_organization(
    payload: OrganizationCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN)),
):
    org = Organization(
        name=payload.name,
        org_type=payload.org_type,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        location=point_from_latlng(payload.latitude, payload.longitude),
        address_text=payload.address_text,
    )
    db.add(org)
    db.commit()
    db.refresh(org)
    return {"id": str(org.id), "name": org.name}


@router.get("/{organization_id}")
def get_organization(
    organization_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    # Tenant isolation: non-admins can only view their own organization.
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN):
        if current_user.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Organization not found")
    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"id": str(org.id), "name": org.name, "org_type": org.org_type.value, "is_active": org.is_active}


@router.post("/{organization_id}/locations", status_code=201)
def add_location(
    organization_id: uuid.UUID,
    payload: LocationCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION_ADMIN, UserRole.SUPER_ADMIN)),
):
    if current_user.role == UserRole.ORGANIZATION_ADMIN and current_user.organization_id != organization_id:
        raise HTTPException(status_code=403, detail="Cannot add a location to another organization")
    loc = OrganizationLocation(
        organization_id=organization_id,
        label=payload.label,
        location=point_from_latlng(payload.latitude, payload.longitude),
        address_text=payload.address_text,
    )
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return {"id": str(loc.id), "label": loc.label}


@router.get("/{organization_id}/waste-analytics")
def organization_waste_analytics(
    organization_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN):
        if current_user.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Organization not found")

    total = (
        db.query(func.coalesce(func.sum(WasteRecord.quantity_kg), 0.0))
        .filter(WasteRecord.source_organization_id == organization_id)
        .scalar()
    )
    by_category = (
        db.query(WasteRecord.category, func.sum(WasteRecord.quantity_kg))
        .filter(WasteRecord.source_organization_id == organization_id)
        .group_by(WasteRecord.category)
        .all()
    )
    return {
        "organization_id": str(organization_id),
        "total_waste_kg": round(total, 2),
        "by_category_kg": {c.value: round(q, 2) for c, q in by_category},
    }


def _authorize_org_access(current_user: User, organization_id: uuid.UUID) -> None:
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN):
        if current_user.role != UserRole.ORGANIZATION_ADMIN or current_user.organization_id != organization_id:
            raise HTTPException(status_code=404, detail="Organization not found")


@router.get("/{organization_id}/locations")
def list_locations(
    organization_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List branch locations for an organization. Returns stored PostGIS points as lat/lng."""
    _authorize_org_access(current_user, organization_id)
    locs = (
        db.query(OrganizationLocation)
        .filter(OrganizationLocation.organization_id == organization_id)
        .order_by(OrganizationLocation.created_at)
        .all()
    )
    from app.core.geo import latlng_from_point
    return [
        {
            "id": str(loc.id),
            "label": loc.label,
            "address_text": loc.address_text,
            "latitude": latlng_from_point(loc.location)[0] if loc.location else None,
            "longitude": latlng_from_point(loc.location)[1] if loc.location else None,
        }
        for loc in locs
    ]


@router.get("/{organization_id}/staff")
def list_staff(    organization_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    _authorize_org_access(current_user, organization_id)
    staff = db.query(User).filter(User.organization_id == organization_id).order_by(User.created_at).all()
    return [
        {
            "id": str(u.id),
            "email": u.email,
            "full_name": u.full_name,
            "phone_number": u.phone_number,
            "is_active": u.is_active,
        }
        for u in staff
    ]


@router.post("/{organization_id}/staff", status_code=201)
def add_staff(
    organization_id: uuid.UUID,
    payload: StaffCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION_ADMIN, UserRole.SUPER_ADMIN)),
):
    """
    Adds a new staff member to the organization as an ORGANIZATION_ADMIN
    account (this platform doesn't yet distinguish staff privilege tiers
    within an organization — every org account can manage that org's own
    data, matching the existing single-role design; see docs/architecture.md
    for the honest scope of this feature). A real random password is
    generated and hashed with bcrypt like any other account — never
    returned in the response or logged — the caller is expected to trigger
    a real password-reset flow to hand it to the new staff member (email
    delivery isn't wired up in this MVP; see docs/notifications.md).
    """
    if current_user.role == UserRole.ORGANIZATION_ADMIN and current_user.organization_id != organization_id:
        raise HTTPException(status_code=403, detail="Cannot add staff to another organization")

    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    org = db.get(Organization, organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    temp_password = secrets.token_urlsafe(18)
    staff_user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(temp_password),
        full_name=payload.full_name,
        phone_number=payload.phone_number,
        role=UserRole.ORGANIZATION_ADMIN,
        organization_id=organization_id,
        is_active=True,
    )
    db.add(staff_user)
    db.flush()
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="ORGANIZATION_STAFF_ADDED",
            entity_type="User",
            entity_id=str(staff_user.id),
            metadata_json={"organization_id": str(organization_id)},
        )
    )
    db.commit()
    db.refresh(staff_user)
    return {"id": str(staff_user.id), "email": staff_user.email, "full_name": staff_user.full_name}


@router.patch("/{organization_id}/staff/{user_id}/deactivate")
def deactivate_staff(
    organization_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.ORGANIZATION_ADMIN, UserRole.SUPER_ADMIN)),
):
    if current_user.role == UserRole.ORGANIZATION_ADMIN and current_user.organization_id != organization_id:
        raise HTTPException(status_code=403, detail="Cannot manage staff for another organization")

    staff_user = db.get(User, user_id)
    if not staff_user or staff_user.organization_id != organization_id:
        raise HTTPException(status_code=404, detail="Staff member not found")
    if staff_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    staff_user.is_active = False
    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="ORGANIZATION_STAFF_DEACTIVATED",
            entity_type="User",
            entity_id=str(staff_user.id),
            metadata_json={"organization_id": str(organization_id)},
        )
    )
    db.commit()
    return {"status": "ok"}
