# Future Roadmap

Per spec section 70 — these are explicitly **not** implemented in the MVP, and nothing in the
codebase pretends otherwise (see `docs/intelligence.md` for the interfaces that stand in for them).

## Phase 2

- Advanced route optimization (replace `DeterministicNearestNeighbourOptimizer` with a real
  ML/OR-based optimizer behind the existing `RouteOptimizer` interface).
- PDF report export — CSV export is implemented (`app/api/v1/reports.py`, `docs/database.md`); PDF
  needs its own layout/design work not done in this pass rather than a bare unstyled placeholder.
- Waste forecasting (`WasteForecaster` interface exists; implementation does not).
- Predictive analytics generally.
- Advanced hotspot detection beyond DBSCAN clustering (e.g. predictive hotspot forecasting).
- SMS notifications (`SMSProvider` interface exists; no gateway configured).
- Push notifications (`PushNotificationProvider` interface exists; no FCM/APNs configured).
- Payment integration (`PaymentProvider` interface exists; MVP has no paid flows at all).
- More sophisticated organization management (bulk staff import, org-level role delegation).
- Rate limiting middleware (flagged in `docs/security.md` as a near-term priority, arguably
  Phase 1.5 rather than Phase 2).
- IndexedDB-backed offline write queue for collectors (flagged in `docs/pwa.md`).

## Phase 3

- IoT smart bins — real hardware integration behind `IoTBinProvider`/`SensorDataProvider`.
- Vehicle telemetry / live GPS tracking behind `VehicleTelemetryProvider`.
- Computer vision waste classification behind `WasteImageClassifier`.
- Full ML-based route optimization and prioritization.
- AI assistant — a conversational interface over the platform's own analytics/collection/
  recycling/environmental-report data (not a generic chatbot). No design work has started on this;
  it's listed because the spec asks it be documented as a future integration point, and the natural
  integration surface is the same `/api/v1/analytics`, `/api/v1/recycling`, `/api/v1/environment`-
  style endpoints already built.

## Explicitly out of scope for the foreseeable roadmap (per spec section 73)

SaaS billing, investor dashboards, subscription payments, revenue management, marketplace
commissions — the spec is explicit this is a technology/product MVP, not a business-model MVP.
