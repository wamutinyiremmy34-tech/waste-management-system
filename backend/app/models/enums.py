import enum


class UserRole(str, enum.Enum):
    CITIZEN = "CITIZEN"
    COLLECTOR = "COLLECTOR"
    COMPANY_ADMIN = "COMPANY_ADMIN"
    ORGANIZATION_ADMIN = "ORGANIZATION_ADMIN"
    RECYCLER = "RECYCLER"
    MUNICIPAL_ADMIN = "MUNICIPAL_ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class WasteCategory(str, enum.Enum):
    ORGANIC = "ORGANIC"
    PLASTIC = "PLASTIC"
    PAPER = "PAPER"
    GLASS = "GLASS"
    METAL = "METAL"
    ELECTRONIC = "ELECTRONIC"
    HAZARDOUS = "HAZARDOUS"
    MIXED = "MIXED"
    OTHER = "OTHER"


class PickupStatus(str, enum.Enum):
    REQUESTED = "REQUESTED"
    ASSIGNED = "ASSIGNED"
    EN_ROUTE = "EN_ROUTE"
    ARRIVED = "ARRIVED"
    COLLECTED = "COLLECTED"
    FAILED = "FAILED"
    MISSED = "MISSED"
    CANCELLED = "CANCELLED"


# Legal forward transitions for a pickup. Enforced in the service layer so a
# COLLECTED pickup can never be silently pushed back to REQUESTED, etc.
PICKUP_TRANSITIONS = {
    PickupStatus.REQUESTED: {PickupStatus.ASSIGNED, PickupStatus.CANCELLED},
    PickupStatus.ASSIGNED: {PickupStatus.EN_ROUTE, PickupStatus.CANCELLED, PickupStatus.MISSED},
    PickupStatus.EN_ROUTE: {PickupStatus.ARRIVED, PickupStatus.FAILED, PickupStatus.MISSED},
    PickupStatus.ARRIVED: {PickupStatus.COLLECTED, PickupStatus.FAILED},
    PickupStatus.COLLECTED: set(),
    PickupStatus.FAILED: set(),
    PickupStatus.MISSED: set(),
    PickupStatus.CANCELLED: set(),
}


class RecurrenceFrequency(str, enum.Enum):
    NONE = "NONE"
    WEEKLY = "WEEKLY"
    BIWEEKLY = "BIWEEKLY"
    MONTHLY = "MONTHLY"
    CUSTOM = "CUSTOM"


class VehicleStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    IN_SERVICE = "IN_SERVICE"
    MAINTENANCE = "MAINTENANCE"
    OUT_OF_SERVICE = "OUT_OF_SERVICE"


class BinStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    FULL = "FULL"
    DAMAGED = "DAMAGED"
    MAINTENANCE = "MAINTENANCE"
    INACTIVE = "INACTIVE"


class ComplaintCategory(str, enum.Enum):
    ILLEGAL_DUMPING = "ILLEGAL_DUMPING"
    OVERFLOWING_BIN = "OVERFLOWING_BIN"
    DAMAGED_BIN = "DAMAGED_BIN"
    MISSED_COLLECTION = "MISSED_COLLECTION"
    ENVIRONMENTAL_HAZARD = "ENVIRONMENTAL_HAZARD"
    OTHER = "OTHER"


class ComplaintStatus(str, enum.Enum):
    REPORTED = "REPORTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    ASSIGNED = "ASSIGNED"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    REJECTED = "REJECTED"


class OrganizationType(str, enum.Enum):
    SCHOOL = "SCHOOL"
    UNIVERSITY = "UNIVERSITY"
    APARTMENT = "APARTMENT"
    HOTEL = "HOTEL"
    OFFICE = "OFFICE"
    RESTAURANT = "RESTAURANT"
    BUSINESS = "BUSINESS"
    INSTITUTION = "INSTITUTION"
    OTHER = "OTHER"


class NotificationType(str, enum.Enum):
    PICKUP_REQUESTED = "PICKUP_REQUESTED"
    PICKUP_ASSIGNED = "PICKUP_ASSIGNED"
    PICKUP_SCHEDULED = "PICKUP_SCHEDULED"
    COLLECTOR_EN_ROUTE = "COLLECTOR_EN_ROUTE"
    COLLECTION_COMPLETED = "COLLECTION_COMPLETED"
    COMPLAINT_UPDATED = "COMPLAINT_UPDATED"
    REWARD_EARNED = "REWARD_EARNED"
    CAMPAIGN_ANNOUNCEMENT = "CAMPAIGN_ANNOUNCEMENT"
    SYSTEM_ANNOUNCEMENT = "SYSTEM_ANNOUNCEMENT"
