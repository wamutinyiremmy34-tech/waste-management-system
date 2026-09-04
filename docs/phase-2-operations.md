# Phase 2 — Pilot Operations & Municipal Intelligence

## Overview

Phase 2 extends EcoTrack from a data-recording platform into an operational intelligence tool.
It exposes the four existing intelligence modules through APIs and dashboards, enabling municipal
administrators, company administrators, and collectors to make better operational decisions using
real data.

No machine learning, no fake AI, no predictions. Every intelligence feature uses deterministic
algorithms on real database data.

---

## Command Centre Architecture

### New API Router: `/api/v1/operations`

All Phase 2 intelligence endpoints live under the `/operations` prefix.

| Endpoint | Method | Roles | Intelligence module |
|---|---|---|---|
| `/operations/hotspots` | GET | SUPER_ADMIN, MUNICIPAL_ADMIN, COMPANY_ADMIN | HotspotDetector (PostGIS ST_ClusterDBSCAN) |
| `/operations/environmental-impact` | GET | Any authenticated | EnvironmentalImpactCalculator |
| `/operations/operational-summary` | GET | SUPER_ADMIN, MUNICIPAL_ADMIN, COMPANY_ADMIN | CollectionPrioritizer + DB aggregation |
| `/operations/zone-performance` | GET | SUPER_ADMIN, MUNICIPAL_ADMIN, COMPANY_ADMIN | DB + PostGIS ST_Contains |
| `/operations/collection-trend` | GET | SUPER_ADMIN, MUNICIPAL_ADMIN, COMPANY_ADMIN | DB time-series |
| `/operations/collector-performance` | GET | SUPER_ADMIN, MUNICIPAL_ADMIN, COMPANY_ADMIN | DB aggregation |
| `/operations/priority-queue` | GET | SUPER_ADMIN, MUNICIPAL_ADMIN, COMPANY_ADMIN | CollectionPrioritizer |
| `/operations/route/{collector_id}` | GET | COLLECTOR (own), COMPANY_ADMIN, MUNICIPAL_ADMIN, SUPER_ADMIN | RouteOptimizer |

### Updated Analytics Endpoints

Existing analytics endpoints received backward-compatible additions:

| Endpoint | Added |
|---|---|
| `GET /analytics/admin-dashboard` | `failed_collections`, `requested_pickups`, `assigned_pickups`, `completion_rate_percent` |
| `GET /analytics/waste-by-category` | `date_from`, `date_to`, `company_id` query filters |
| `GET /analytics/complaint-analytics` | `date_from`, `date_to` query filters; `total` and `resolved` counts added |

### New Organizations Endpoint

| Endpoint | Method | Description |
|---|---|---|
| `/organizations/{id}/locations` | GET | List branch locations (was write-only before Phase 2) |

---

## Dashboard Changes

### Admin / Municipal Dashboard (`/admin`)

**Before:** 8 stat cards + CSS bar chart + complaint list + reports panel.

**After:**
- Tabbed layout: Overview · Zones · Priority Queue · Complaints · Reports
- **Overview tab:** 8 stat cards (including completion rate) + 30-day collection trend bar chart + waste-by-category chart + environmental impact widget (CO2e, diversion rate) + complaint category/status breakdown + hotspot cluster list
- **Zones tab:** Per-zone performance table with completion rate, waste collected, complaint count, attention flag
- **Priority Queue tab:** Overdue pickups ordered by CollectionPrioritizer score with priority labels (HIGH/MEDIUM/LOW) and attention item banners
- **Complaints tab:** Full complaint list with workflow buttons (unchanged, preserved)
- **Reports tab:** Download panel with date/filter inputs (unchanged, preserved)

**Attention items:** Dynamically generated banners at the top of every page view listing HIGH/MEDIUM operational issues (high backlog, overdue pickups, high failure rate).

---

### Company Dashboard (`/company`)

**Before:** 4 stat cards (pending pickups showed only ASSIGNED, not REQUESTED backlog) + vehicle list + collector list (UUID only) + zone list + zone drawer.

**After:**
- Stat cards now show **unassigned backlog** (REQUESTED count, not just ASSIGNED) + completion rate
- **Collector performance table:** Name, completions, failures, kg collected, completion rate per collector — replaces the UUID-only list
- Vehicles section and Zone Drawer preserved

---

### Organization Dashboard (`/organization`)

**Before:** Waste analytics + location add form + staff CRUD + placeholder note about recurring schedules.

**After:**
- **Branch locations list:** All stored locations now displayed (read endpoint `/organizations/{id}/locations` added)
- **Recurring schedules section:** Live list of the organization's active recurring schedules with frequency, category, next run date, and active status (replaces the "not yet built" placeholder)
- Existing waste analytics, location add form, and staff CRUD preserved

---

### Collector Dashboard (`/collector`)

**Before:** Active jobs + completed today count + pickup list (creation order) + inline workflow forms.

**After:**
- **Route-optimized ordering:** Pickups sorted by nearest-neighbour route optimization; "Stop N" badge on each card
- A note clarifying the ordering is route-optimized (nearest-neighbour, not ML)
- Completed/failed pickups shown in a collapsed section below active pickups
- All offline queue functionality preserved intact (IndexedDB, sync banner, conflict handling)

---

### Recycler Dashboard (`/recycler`)

**Before:** 2 stat cards (total recycled, diversion rate) + log form + records list.

**After:**
- 4 stat cards: total recycled + diversion rate + total collected (platform) + **estimated CO2e avoided**
- **By-category breakdown bar chart** — the `recycled_by_category_kg` field was returned by the API but never displayed; now rendered
- CO2e disclaimer note linking to docs/environmental-impact.md
- Log form and records list preserved

---

## Operational Intelligence Services

### `operational_service.py`

New service module providing business logic for all Phase 2 endpoints.

| Function | Description |
|---|---|
| `get_overdue_pickups()` | Detects REQUESTED/ASSIGNED pickups past their preferred_date or 2-day grace period |
| `get_collection_kpis()` | Completion/failure/miss rates + unassigned backlog + avg weight |
| `get_collection_trend()` | Daily completed/failed counts for N days |
| `get_zone_performance()` | Per-zone aggregation with PostGIS complaint count |
| `get_collector_performance()` | Per-collector KPIs with real names |
| `get_priority_pickup_queue()` | CollectionPrioritizer-scored pickup queue |
| `get_optimized_route()` | RouteOptimizer nearest-neighbour for a collector's assignments |

---

## Tenant Isolation

All Phase 2 endpoints enforce the same tenant boundaries as Phase 1:

- `COMPANY_ADMIN`: automatically scoped to their `waste_company_id` — cannot pass a different company_id
- `SUPER_ADMIN` / `MUNICIPAL_ADMIN`: can request any company_id or platform-wide
- `COLLECTOR`: can only fetch their own route (`/operations/route/{id}`)
- Tenant scoping is enforced in `_resolve_company_id()` in `operations.py` — not in the UI

Cross-tenant access returns 403 (role check) or 404 (resource check). Existence of another company's data is never leaked.

---

## Seed Data (Phase 2)

The seed script was significantly enriched for Phase 2:

| Before | After |
|---|---|
| 1 company, 1 org, 1 collector | 2 companies, 2 orgs, 1 recycler, 5 collectors |
| 2 pickups (1 completed) | 100+ pickups over 35 days with realistic status distribution |
| 1 complaint | 17 complaints in 2 geographic hotspot clusters + 6 scattered |
| 1 waste record | Daily waste records (30 days, 4 categories) |
| 0 recycling records (beyond the 1 initial) | 40+ recycling records (30 days, 4 categories) |
| 0 points ledger entries | Points entries for completed pickups across all citizens |
| 1 zone | 3 zones covering Ntinda-Nakawa, Kololo-Makerere, Central-Muyenga |
| 1 vehicle | 5 vehicles with varied statuses |

The seed now produces enough data for every intelligence feature to return meaningful output.

---

## Geographic Intelligence

### Hotspot Detection

Uses existing `HotspotDetector.detect_complaint_hotspots()` — now exposed via `GET /operations/hotspots`.

The seed creates two realistic complaint clusters:
1. **Owino Market cluster** (6 complaints near 0.314°N, 32.581°E) — illegal dumping
2. **Nakawa Industrial cluster** (5 complaints near 0.330°N, 32.615°E) — illegal dumping

### Zone Boundary Complaints

`GET /operations/zone-performance` uses PostGIS `ST_Contains(zone.boundary, complaint.location)` to count complaints inside each zone boundary without requiring a manual zone assignment on the complaint. This connects geographic complaints to operational zones automatically.

### Route Optimization

`GET /operations/route/{collector_id}` uses `DeterministicNearestNeighbourOptimizer` starting from the collector's `last_known_location` (or Kampala default if not checked in). The collector dashboard displays the suggested sequence with "Stop N" badges.

---

## Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| `CollectionPrioritizer` uses `bin_fill_percent=0` and `nearby_complaint_count=0` | Score driven only by `days_overdue` | Acceptable for pilot; full scoring needs a spatial complaint query per pickup |
| Hotspot detection includes resolved complaints | Old resolved clusters appear as active | Filter by `status != RESOLVED` or add `date_from` parameter (future) |
| Zone performance only counts pickups with `assigned_zone_id` set | Unassigned pickups don't appear in any zone | Pickup assignment workflow improvement needed |
| Route optimizer uses collector's last GPS check-in, not live position | Route starts from stale origin if collector hasn't checked in | Collector should check in at start of shift; GPS auto-push is a Phase 3 feature |
| No chart library — all charts are CSS div bars | No interactive tooltips, no axis labels | Adequate for pilot; Recharts/Chart.js can be added without changing data layer |
| No map library — hotspots shown as a list, not on a map | Less geographically intuitive | Leaflet can be added in a follow-up sprint without changing any API |

---

## Security Verification

All new endpoints follow existing patterns:

- Every endpoint requires authentication (`get_current_user` or `require_roles`)
- COMPANY_ADMIN role is automatically scoped — `_resolve_company_id()` ignores any `company_id` query param from COMPANY_ADMIN users
- No new database queries leak cross-tenant data
- New tests cover: citizen forbidden, company isolation, collector owns-own-route
- `GET /operations/environmental-impact` is intentionally accessible to all authenticated users (platform-wide environmental data is not sensitive)
