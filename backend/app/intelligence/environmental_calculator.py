"""
EnvironmentalImpactCalculator — spec section 23.

Computes real totals from recorded WasteRecord/RecyclingRecord data. Any
per-kg equivalence factors (e.g. "kg CO2e avoided per kg recycled") are
loaded from configuration, clearly labeled as assumptions, and are NOT
presented as precise scientific measurements.
"""
from dataclasses import dataclass

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.enums import WasteCategory
from app.models.pickup import WasteRecord
from app.models.recycling_rewards import RecyclingRecord

# Configurable, documented assumptions (see docs/environmental-impact.md).
# These are illustrative estimates, not verified life-cycle-analysis figures.
CO2E_AVOIDED_PER_KG_RECYCLED = {
    WasteCategory.PLASTIC: 1.5,
    WasteCategory.PAPER: 0.9,
    WasteCategory.GLASS: 0.3,
    WasteCategory.METAL: 2.0,
    WasteCategory.ORGANIC: 0.25,
    WasteCategory.ELECTRONIC: 1.2,
    WasteCategory.HAZARDOUS: 0.0,
    WasteCategory.MIXED: 0.4,
    WasteCategory.OTHER: 0.2,
}


@dataclass
class EnvironmentalImpactSummary:
    total_waste_collected_kg: float
    total_waste_recycled_kg: float
    diversion_rate_percent: float
    estimated_co2e_avoided_kg: float
    is_estimate: bool = True


def calculate_environmental_impact(db: Session) -> EnvironmentalImpactSummary:
    total_collected = db.query(func.coalesce(func.sum(WasteRecord.quantity_kg), 0.0)).scalar()
    recycled_by_category = (
        db.query(RecyclingRecord.waste_category, func.sum(RecyclingRecord.quantity_kg))
        .group_by(RecyclingRecord.waste_category)
        .all()
    )
    total_recycled = sum(qty for _, qty in recycled_by_category)
    diversion_rate = (total_recycled / total_collected * 100) if total_collected else 0.0

    estimated_co2e = sum(
        qty * CO2E_AVOIDED_PER_KG_RECYCLED.get(category, 0.0) for category, qty in recycled_by_category
    )

    return EnvironmentalImpactSummary(
        total_waste_collected_kg=round(total_collected, 2),
        total_waste_recycled_kg=round(total_recycled, 2),
        diversion_rate_percent=round(diversion_rate, 2),
        estimated_co2e_avoided_kg=round(estimated_co2e, 2),
        is_estimate=True,
    )
