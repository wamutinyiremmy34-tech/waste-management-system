"""
Future-technology interfaces required by the spec (sections 19, 51-55).

Each class below defines the shape a future implementation must satisfy.
None of them fabricate the underlying capability — where an MVP
implementation is reasonable (deterministic, rule-based) it's provided;
otherwise the method raises NotImplementedError and is documented as such.
See docs/future-roadmap.md.
"""
from abc import ABC, abstractmethod


class CollectionPrioritizer:
    """
    MVP: configurable scoring rules (not ML). Higher score = higher priority.
    Admins can tune the weights; there is no learned model behind this.
    """

    def __init__(self, weights: dict | None = None):
        self.weights = weights or {"days_overdue": 2.0, "bin_fill_percent": 0.5, "complaint_count": 5.0}

    def score(self, days_overdue: int, bin_fill_percent: float, nearby_complaint_count: int) -> float:
        w = self.weights
        return (
            days_overdue * w["days_overdue"]
            + bin_fill_percent * w["bin_fill_percent"]
            + nearby_complaint_count * w["complaint_count"]
        )


class WasteForecaster(ABC):
    """
    Interface only — NOT implemented in the MVP. A future implementation
    (Phase 2/3) would use historical WasteRecord data for time-series
    forecasting. Calling this in the MVP is a programming error, not a
    silently-faked prediction.
    """

    @abstractmethod
    def forecast(self, organization_id: str, horizon_days: int) -> list[dict]:
        raise NotImplementedError(
            "WasteForecaster is not implemented in the MVP. See docs/future-roadmap.md (Phase 2)."
        )


class IoTBinProvider(ABC):
    """
    Interface only — no real IoT hardware exists yet. The MVP's bin fill
    level is set manually or from a valid system event (see app/api/v1/bins.py).
    A future sensor integration implements this interface to push real
    readings instead.
    """

    @abstractmethod
    def get_fill_level(self, bin_id: str) -> float:
        raise NotImplementedError("No IoT hardware connected. See docs/future-roadmap.md (Phase 3).")


class SensorDataProvider(ABC):
    """Future (Phase 3): generic sensor telemetry ingestion. Interface only."""

    @abstractmethod
    def get_latest_reading(self, sensor_id: str) -> dict:
        raise NotImplementedError("No sensor hardware connected. See docs/future-roadmap.md (Phase 3).")


class VehicleTelemetryProvider(ABC):
    """Future (Phase 3): live GPS/vehicle telemetry. Interface only."""

    @abstractmethod
    def get_live_position(self, vehicle_id: str) -> dict:
        raise NotImplementedError("No vehicle telemetry hardware connected. See docs/future-roadmap.md (Phase 3).")


class WasteImageClassifier(ABC):
    """
    Future (Phase 3): computer-vision waste categorization from photos. The
    MVP continues to use manually selected waste categories everywhere.
    """

    @abstractmethod
    def classify(self, image_bytes: bytes) -> str:
        raise NotImplementedError("No computer-vision model integrated. See docs/future-roadmap.md (Phase 3).")


class PaymentProvider(ABC):
    """Future: payment integration. Not implemented; MVP has no paid flows."""

    @abstractmethod
    def charge(self, user_id: str, amount_cents: int, currency: str) -> dict:
        raise NotImplementedError("No payment provider integrated. See docs/future-roadmap.md (Phase 2).")
