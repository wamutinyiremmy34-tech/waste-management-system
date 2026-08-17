import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import WasteCategory
from app.models.mixins import TimestampMixin, UUIDPKMixin


class RecyclingRecord(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "recycling_records"

    recycler_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("recycling_partners.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True
    )
    waste_category: Mapped[WasteCategory] = mapped_column(Enum(WasteCategory, name="waste_category"))
    quantity_kg: Mapped[float] = mapped_column(Float, nullable=False)
    received_date: Mapped[date] = mapped_column(Date, nullable=False)
    destination: Mapped[str | None] = mapped_column(String(255), nullable=True)


class RewardRule(Base, UUIDPKMixin, TimestampMixin):
    """Admin-configurable: how many points an activity type earns."""

    __tablename__ = "reward_rules"

    activity_type: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class PointsLedgerEntry(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "points_ledger_entries"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    activity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    points: Mapped[int] = mapped_column(Integer, nullable=False)  # can be negative for redemptions
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)

    user = relationship("User", back_populates="points_ledger_entries")


class Reward(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "rewards"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    points_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)  # null = unlimited
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class RewardRedemption(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "reward_redemptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    reward_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rewards.id", ondelete="CASCADE"), nullable=False
    )
    points_spent: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="PENDING")  # PENDING, FULFILLED, CANCELLED


class Campaign(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "campaigns"

    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    zone_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("collection_zones.id", ondelete="SET NULL"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class CampaignParticipation(Base, UUIDPKMixin, TimestampMixin):
    __tablename__ = "campaign_participations"

    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    points_earned: Mapped[int] = mapped_column(Integer, default=0)
