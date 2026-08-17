import uuid

from geoalchemy2 import Geometry
from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import OrganizationType
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Organization(Base, UUIDPKMixin, TimestampMixin):
    """A tenant: school, hotel, office, apartment complex, etc."""

    __tablename__ = "organizations"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    org_type: Mapped[OrganizationType] = mapped_column(
        Enum(OrganizationType, name="organization_type"), nullable=False
    )
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # Primary location, real PostGIS geography point (lon/lat, SRID 4326).
    location: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    address_text: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Which waste company services this organization by default (optional).
    waste_company_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("waste_companies.id", ondelete="SET NULL"), nullable=True
    )

    is_active: Mapped[bool] = mapped_column(default=True)

    locations = relationship("OrganizationLocation", back_populates="organization")


class OrganizationLocation(Base, UUIDPKMixin, TimestampMixin):
    """Organizations may operate multiple physical locations/branches."""

    __tablename__ = "organization_locations"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[object] = mapped_column(Geometry(geometry_type="POINT", srid=4326), nullable=False)
    address_text: Mapped[str | None] = mapped_column(String(500), nullable=True)

    organization = relationship("Organization", back_populates="locations")


class WasteCompany(Base, UUIDPKMixin, TimestampMixin):
    """A waste-management company tenant (owns collectors, vehicles, zones)."""

    __tablename__ = "waste_companies"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)

    # Optional municipal parent (a company can operate under a municipality).
    municipality_name: Mapped[str | None] = mapped_column(String(255), nullable=True)


class RecyclingPartner(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "recycling_partners"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    location: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    accepted_categories: Mapped[str | None] = mapped_column(String(500), nullable=True)  # csv of WasteCategory
    is_active: Mapped[bool] = mapped_column(default=True)
