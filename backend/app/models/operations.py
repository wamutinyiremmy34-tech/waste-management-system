import uuid

from geoalchemy2 import Geometry
from sqlalchemy import Enum, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import VehicleStatus
from app.models.mixins import TimestampMixin, UUIDPKMixin


class Collector(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "collectors"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    waste_company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("waste_companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_zones.id", ondelete="SET NULL"), nullable=True
    )
    assigned_vehicle_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True
    )
    # Last known location, updated by the collector app (used for "nearby
    # collector" / ETA style features). Nullable until first check-in.
    last_known_location: Mapped[object | None] = mapped_column(
        Geometry(geometry_type="POINT", srid=4326), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(default=True)

    user = relationship("User", back_populates="collector_profile")


class Vehicle(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "vehicles"

    waste_company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("waste_companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    registration_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    vehicle_type: Mapped[str] = mapped_column(String(64), nullable=False)  # truck, tuk-tuk, compactor...
    capacity_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[VehicleStatus] = mapped_column(
        Enum(VehicleStatus, name="vehicle_status"), default=VehicleStatus.AVAILABLE
    )
    # use_alter breaks the collectors<->vehicles circular FK dependency so
    # both tables can be created (the constraint is added in a second pass).
    assigned_driver_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collectors.id", ondelete="SET NULL", use_alter=True, name="fk_vehicles_assigned_driver"),
        nullable=True,
    )


class VehicleMaintenanceRecord(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "vehicle_maintenance_records"

    vehicle_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(String(1000), nullable=False)
    cost: Mapped[float | None] = mapped_column(Float, nullable=True)


class CollectionZone(Base, UUIDPKMixin, TimestampMixin):
    """A geographic service area. Uses a real PostGIS polygon, not lat/lng bounds."""

    __tablename__ = "collection_zones"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    waste_company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("waste_companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    boundary: Mapped[object] = mapped_column(Geometry(geometry_type="POLYGON", srid=4326), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
