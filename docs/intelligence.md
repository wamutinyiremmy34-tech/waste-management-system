# Intelligence Architecture

Per spec sections 25/26/51, "intelligence" features use deterministic/rule-based MVP
implementations behind interfaces that a future ML implementation can replace without touching
calling code.

| Component | MVP implementation | Future (documented, not built) |
|---|---|---|
| `RouteOptimizer` | `DeterministicNearestNeighbourOptimizer` — greedy nearest-neighbour using haversine distance | `MLRouteOptimizer` using historical traffic/collection-time data |
| `CollectionPrioritizer` | Configurable weighted-sum scoring (`days_overdue`, `bin_fill_percent`, `nearby_complaint_count`) | Learned prioritization model |
| `HotspotDetector` | Real PostGIS `ST_ClusterDBSCAN` spatial clustering of complaints | ML-based predictive hotspot forecasting |
| `EnvironmentalImpactCalculator` | Real totals from `WasteRecord`/`RecyclingRecord`, with a clearly-labeled, configurable CO2e-per-kg assumption table (not verified LCA figures) | Verified life-cycle-analysis-backed figures |
| `WasteForecaster` | **Not implemented** — abstract interface only, raises `NotImplementedError` if called | Time-series forecasting from historical `WasteRecord` data |
| `IoTBinProvider` / `SensorDataProvider` / `VehicleTelemetryProvider` | **Not implemented** — interfaces only | Real sensor/GPS hardware integration |
| `WasteImageClassifier` | **Not implemented** — interface only; MVP uses manually-selected waste categories everywhere | Computer-vision waste categorization from photos |
| `PaymentProvider` | **Not implemented** — interface only; MVP has no paid flows | Real payment gateway integration |

All of the above live in `backend/app/intelligence/`. The "not implemented" ones are abstract
classes whose methods raise `NotImplementedError` with a pointer to this doc — calling them is a
clear programming error, not a silently-faked result.

## Why this split matters

The spec is explicit that fabricating ML/IoT/CV/payment capability is worse than not having it. A
caller that accidentally invokes `WasteForecaster.forecast()` gets an immediate, loud failure in
development/testing, not a plausible-looking made-up number that could reach a dashboard.
