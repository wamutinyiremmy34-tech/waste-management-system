import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.enums import PickupStatus, UserRole
from app.models.operations import Collector, Vehicle
from app.models.pickup import PickupRequest
from app.models.tenant import WasteCompany
from app.models.user import User
from app.security.dependencies import get_current_user, require_roles

router = APIRouter(prefix="/companies", tags=["companies"])


class CompanyCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    contact_email: str | None = None
    contact_phone: str | None = None
    municipality_name: str | None = None


@router.post("", status_code=201)
def create_company(
    payload: CompanyCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN)),
):
    company = WasteCompany(
        name=payload.name,
        contact_email=payload.contact_email,
        contact_phone=payload.contact_phone,
        municipality_name=payload.municipality_name,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    return {"id": str(company.id), "name": company.name}


@router.get("/{company_id}")
def get_company(company_id: uuid.UUID, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in (UserRole.SUPER_ADMIN, UserRole.MUNICIPAL_ADMIN):
        if current_user.waste_company_id != company_id:
            raise HTTPException(status_code=404, detail="Company not found")
    company = db.get(WasteCompany, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return {"id": str(company.id), "name": company.name, "is_active": company.is_active}


@router.get("/{company_id}/dashboard")
def company_dashboard(
    company_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.SUPER_ADMIN)),
):
    if current_user.role == UserRole.COMPANY_ADMIN and current_user.waste_company_id != company_id:
        raise HTTPException(status_code=404, detail="Company not found")

    total_collectors = db.query(func.count(Collector.id)).filter(Collector.waste_company_id == company_id).scalar()
    total_vehicles = db.query(func.count(Vehicle.id)).filter(Vehicle.waste_company_id == company_id).scalar()
    pending_pickups = (
        db.query(func.count(PickupRequest.id))
        .filter(PickupRequest.waste_company_id == company_id, PickupRequest.status == PickupStatus.ASSIGNED)
        .scalar()
    )
    completed_pickups = (
        db.query(func.count(PickupRequest.id))
        .filter(PickupRequest.waste_company_id == company_id, PickupRequest.status == PickupStatus.COLLECTED)
        .scalar()
    )

    return {
        "company_id": str(company_id),
        "total_collectors": total_collectors,
        "total_vehicles": total_vehicles,
        "pending_pickups": pending_pickups,
        "completed_pickups": completed_pickups,
    }
