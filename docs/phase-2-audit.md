# EcoTrack Phase 2 Audit — Pilot Operations & Municipal Intelligence

**Date:** 2026-09-04  
**Purpose:** Discovery audit before Phase 2 implementation. Documents what exists, what works, what is wired up, and what gaps must be closed.

---

## 1. Executive Summary

EcoTrack has a solid MVP with production-grade security, a complete pickup state machine, RLS-enforced multi-tenancy, and four working intelligence modules. However, **none of the four intelligence modules are exposed through any API endpoint or displayed on any dashboard**. The system records operational data but provides almost no tools to act on it.

Phase 2 must bridge the gap from "a system that records activity" to "a system that helps operators understand what requires attention and what to do about it."

---

## 2. Dashboard Audit

### `/admin` (SUPER_ADMIN / MUNICIPAL_ADMIN)
**Current state:**
- 8 scalar stat cards (total users, completed collections, missed collections, waste kg, recycled kg, complaints, unresolved)
- One CSS-bar-chart of waste by category (no chart library)
- A single complaint resolution rate % number
- Full complaint list with status workflow buttons
- Report download panel with date/org/zone/recycler filters

**What is missing:**
- No time-series trends for any metric
- No zone-level breakdown
- No map — complaint/bin/pickup locations are stored in PostGIS but never displayed
- `HotspotDetector` output not shown anywhere
- `CollectionPrioritizer` output not shown anywhere
- Complaint `by_category` data returned by API but not rendered
- No overdue pickup queue (pickups that have been REQUESTED for days with no assignment)
- No collector performance summary
- No vehicle availability breakdown

### `/company` (COMPANY_ADMIN)
**Current state:**
- 4 stat cards: collectors, vehicles, pending pickups (ASSIGNED only), completed pickups
- Vehicle list with status dropdown
- Collector list (shows UUID only — not name)
- Zone list with ZoneDrawer tool

**What is missing:**
- `pending_pickups` only counts ASSIGNED status — the REQUESTED (unassigned) backlog is invisible
- Collector names not shown (only truncated UUIDs)
- No waste quantity total for the company
- No collector performance (collections/day, kg totals, completion rate)
- No vehicle utilization
- No route optimization interface

### `/organization` (ORGANIZATION_ADMIN)
**Current state:**
- Waste total + by-category CSS bar chart
- Location add form (GPS)
- Staff CRUD

**What is missing:**
- No pickup history or pickup status display
- No waste trend over time
- No recurring schedule management (placeholder stub exists in the page)
- Locations are stored but never listed/displayed after creation
- No complaints for the organization shown

### `/collector` (COLLECTOR)
**Current state:**
- 2 stat cards: active jobs, completed today
- Full pickup status progression (ASSIGNED→EN_ROUTE→ARRIVED→COLLECTED/FAILED)
- Offline queue with IndexedDB-backed sync
- Inline failure reason form

**What is missing:**
- No map showing pickup locations or route
- Route optimizer never called — pickups shown in creation order, not optimized sequence
- Collector GPS location never pushed (`PATCH /collectors/me/location` never called)
- No priority ordering — no way to know which pickup is most urgent
- No historical performance display

### `/recycler` (RECYCLER)
**Current state:**
- Platform-wide diversion stats + recycling log form + records list

**What is missing:**
- CO2e estimate not displayed (environmental_calculator computes it but recycler page doesn't show it)
- No by-category breakdown chart (API returns it, page doesn't render it)
- No trend over time

---

## 3. Intelligence Module Audit

| Module | Algorithm | API Endpoint | Dashboard | Status |
|---|---|---|---|---|
| `HotspotDetector` | PostGIS `ST_ClusterDBSCAN` on complaints | ❌ None | ❌ None | **Ready — needs wiring** |
| `RouteOptimizer` | Haversine nearest-neighbour greedy sort | ❌ None | ❌ None | **Ready — needs wiring** |
| `EnvironmentalImpactCalculator` | DB aggregates + configurable CO2e factors | ✅ Reports only (PDF/CSV) | ❌ No live widget | **Partially wired — needs dashboard endpoint** |
| `CollectionPrioritizer` | Weighted score: overdue×2 + fill%×0.5 + complaints×5 | ❌ None | ❌ None | **Ready — needs wiring** |

---

## 4. Analytics API Audit

| Endpoint | What it returns | Filters | Gaps |
|---|---|---|---|
| `GET /analytics/admin-dashboard` | 9 scalar totals | None | No time window, no company/zone breakdown, no overdue count |
| `GET /analytics/waste-by-category` | `{category: kg}` dict | None | No date range, no scoping |
| `GET /analytics/complaint-analytics` | by_category, by_status, resolution_rate | None | No date range, no geographic breakdown, avg resolution time missing |
| `GET /companies/{id}/dashboard` | 4 scalars | company_id | REQUESTED backlog invisible (only counts ASSIGNED as "pending") |
| `GET /organizations/{id}/waste-analytics` | total + by-category kg | org_id | No date range, no pickup count |
| `GET /recycling/impact-summary` | totals + by-category | None | No date range, no CO2e in response |

**No time-series endpoints exist anywhere in the system.**

---

## 5. PostGIS Usage Audit

| Operation | File | Purpose |
|---|---|---|
| `ST_DWithin` + `ST_Distance` | `bins.py` | Nearby bin search |
| `ST_Contains` | `zones.py` | Point-in-polygon zone lookup |
| `ST_GeomFromText` | `zones.py`, `seed.py` | WKT polygon write |
| `ST_ClusterDBSCAN` | `hotspot_detector.py` | Complaint spatial clustering |
| `ST_Centroid(ST_Collect(...))` | `hotspot_detector.py` | Hotspot centroid |
| `ST_AsGeoJSON` | `hotspot_detector.py` | GeoJSON output |
| `from_shape(Point(...))` | `geo.py` | Point insert utility |

**Missing spatial operations needed for Phase 2:**
- `ST_DWithin` for counting nearby complaints to a pickup location (for `CollectionPrioritizer`)
- Distance from collector `last_known_location` to pickup locations (for route optimization)
- Zone-level aggregation (join `pickup_requests` by location to `collection_zones` boundary)
- Pickup/complaint heatmap (grid cell aggregation for map visualization)

---

## 6. Seed Data Audit

**Current seed creates:**
- 1 complaint → hotspot_detector produces zero clusters (needs min 3 per cluster)
- 1 collection + 1 waste record → analytics charts show only ORGANIC with 18.5kg
- 0 points ledger entries → leaderboard empty
- 0 time spread → all data from ≤2 days ago, no trends possible
- 1 collector → no comparative performance metrics
- 1 company, 1 org → no multi-tenant variety

**Verdict:** Seed data is geographically authentic (real Kampala coordinates, Ugandan names, KCCA context) but too sparse for any intelligence feature to produce meaningful output. Phase 2 requires a rich seed with at least 30 days of history, 100+ pickups, 15+ complaints in clusters, and data for all roles.

---

## 7. Frontend Infrastructure Gaps

| Need | Current state | Gap |
|---|---|---|
| Chart library | None — CSS `div` bars | No Recharts/Chart.js |
| Map library | None — SVG ZoneDrawer only | No Leaflet/Mapbox |
| Time-series data | No time-series API endpoints | Can't draw trend lines |
| Real-time updates | No WebSocket/SSE | Acceptable — polling on page load is sufficient for pilot |

---

## 8. APIs That Exist But Are Never Used by the Frontend

The following backend endpoints have no frontend integration:
- `GET /rewards/leaderboard`, `/rewards/history`, `/rewards/catalog`, `/rewards/rules`
- `GET /zones/lookup`
- `PATCH /collectors/me/location`
- `POST /vehicles/{id}/maintenance`
- `GET /admin/users`, `/admin/audit-logs`, `PATCH /admin/users/{id}/role`, `PATCH /admin/users/{id}/active`
- `GET /bins/nearby`, `GET /bins/{id}`, `POST /bins`, `PATCH /bins/{id}/fill-level`
- `GET /complaints/mine`, `GET /complaints/{id}`
- `POST /pickups/{id}/assign` (no assignment UI on any page)
- `PATCH /collectors/{id}/assignment`

---

## 9. Schema Data Never Surfaced

| Data | Stored | API | UI |
|---|---|---|---|
| `Collection.collection_location` | ✅ | ❌ | ❌ |
| `Collection.completion_notes` | ✅ | In CSV only | ❌ |
| `Complaint.resolved_at` | ✅ | ❌ | ❌ |
| `Complaint.assigned_to_user_id` | ✅ (field exists, never populated) | ❌ | ❌ |
| `Bin.last_collected_at` | ✅ | ❌ | ❌ |
| `Collector.last_known_location` | ✅ | ✅ lat/lng | ❌ no map |
| `VehicleMaintenanceRecord` | ✅ | Write only, zero read endpoint | ❌ |
| `Campaign` + `CampaignParticipation` | ✅ | ❌ no endpoints | ❌ |
| `OrganizationLocation` list | ✅ | ❌ no read endpoint | ❌ |
| `PickupRequest.preferred_date` | ✅ | ✅ in PickupOut | ❌ not displayed |
| `WasteRecord.location` | ✅ | ❌ | ❌ |

---

## 10. Phase 2 Implementation Plan

### Phase B — Data Quality & Seed
- Enrich seed script: 100+ pickups over 30 days, 5+ collectors, 15+ complaints, daily WasteRecords
- Add `PointsLedgerEntry` entries for leaderboard
- Fix: `Complaint.assigned_to_user_id` never set (field exists, no write path)
- Document: `OrganizationLocation` has no list endpoint

### Phase C — Backend Intelligence APIs

New endpoints to add (all under `/api/v1`):

| Endpoint | Intelligence | Description |
|---|---|---|
| `GET /analytics/hotspots` | HotspotDetector | Complaint clusters via ST_ClusterDBSCAN |
| `GET /analytics/environmental-impact` | EnvironmentalImpactCalculator | Live CO2e/diversion widget data |
| `GET /analytics/operational-summary` | CollectionPrioritizer | Overdue pickups, attention items |
| `GET /analytics/zone-performance` | DB aggregation | Per-zone pickup/complaint/waste stats |
| `GET /analytics/collection-trends` | DB aggregation | Daily/weekly pickup counts over time |
| `GET /analytics/collector-performance` | DB aggregation | Per-collector completions, kg, rate |
| `GET /routes/optimize` | RouteOptimizer | Ordered stop sequence for a collector |

### Phase D — Dashboard Improvements
- Admin: add hotspot list, overdue queue, trend chart, environmental widget, complaint category breakdown
- Company: fix REQUESTED backlog visibility, add collector names, add waste totals, add performance table
- Organization: add pickup history, add recurring schedule management, add location list
- Collector: add priority ordering, add route sequence display, push GPS location on start

### Phase E — Geographic Intelligence
- Add Leaflet map to admin page (complaints, hotspots, bins layers)
- Add collector location display
- Zone performance overlay

### Phase F — Reporting Improvements
- Add date range filter to `waste-by-category` and `complaint-analytics`
- Add zone performance report

### Phase G — Seed Enrichment
- Rich Kampala demo data for all intelligence features

### Phase H — Tests
- Backend: hotspot, prioritizer, route optimizer, zone performance, trend endpoints
- Frontend: dashboard rendering, loading/empty/error states
- E2E: municipal admin flow, company admin flow, collector priority flow

---

## 11. What NOT to Build in Phase 2

Per the spec — these remain future phase:
- ML waste forecasting
- IoT bin sensors
- Vehicle GPS telemetry
- Computer vision
- Payment integration
- External SMS/email/push
- S3 storage
- WebSocket live tracking
- Any feature labeled "AI-powered" or "predictive"
