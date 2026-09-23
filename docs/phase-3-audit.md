# EcoTrack Phase 3 Audit — Real Pilot Deployment, Maps & Field Operations

**Date:** 2026-09-04  
**Scope:** Pre-implementation discovery for Phase 3

---

## 1. Priority Scoring Gap (Phase 2 Limitation 1)

### Current state
`operational_service.py` — both `get_overdue_pickups()` and `get_priority_pickup_queue()` call:
```python
_PRIORITIZER.score(days_overdue=overdue_days, bin_fill_percent=0.0, nearby_complaint_count=0)
```
The comments explicitly note the 0-values and why they exist. Score is driven entirely by `days_overdue`.

### What exists that can be used
- `Bin.current_fill_percent` — real Float column, populated by seed (10–95%) and by `PATCH /bins/{id}/fill-level`
- `Bin.location` — PostGIS POINT(SRID 4326) with spatial index
- `Complaint.location` — PostGIS POINT(SRID 4326) with spatial index
- `PickupRequest.location` — PostGIS POINT(SRID 4326)
- `bins.py` already uses `ST_DWithin` with Geography cast for nearby bin search — same pattern applies here
- `CollectionPrioritizer` weights: `{"days_overdue": 2.0, "bin_fill_percent": 0.5, "complaint_count": 5.0}`

### What is missing
- No query that finds the nearest bin to a pickup location and returns its fill level
- No `ST_DWithin` query counting complaints within radius of a pickup location

### Proposed implementation
**Nearby complaint count:** Single SQL query using `ST_DWithin(Complaint.location, PickupRequest.location, radius)` as a subquery or correlated count. Batch all pickups in one query using a JOIN rather than N individual queries.

**Nearest bin fill:** Find the closest bin within `NEARBY_BIN_RADIUS_METERS` (configurable) and use its `current_fill_percent`. If no bin is within range, use 0.

**Radius default:** The existing `bins.py` uses a default of 1000m for nearby bin search. 500m is a reasonable default for "associated complaint/bin radius" around a pickup — configurable via Settings. This matches realistic walking distance in Kampala.

**Performance:** Per-pickup indexed `ST_DWithin` queries using PostGIS GIST spatial indexes on `complaint.location` and `bin.location`. Each query is a fast index seek, not a full scan. At pilot scale (< 100 active pickups) this is the correct tradeoff. A true single-SQL batch via `VALUES` lateral join is the future improvement for larger deployments.

**Configurable radius:** Add `NEARBY_RADIUS_METERS: int = 500` to `Settings`.

---

## 2. Collector Location Gap (Phase 2 Limitation 2)

### Current state
- `PATCH /collectors/me/location` exists in `collectors.py` — fully implemented, correct RBAC
- `api.ts` includes `myCollectorProfile` but no `updateCollectorLocation` method
- Collector dashboard calls `api.myCollectorProfile(token)` to get `profile.id` for route fetching
- No geolocation is requested; route optimizer falls back to Kampala default `(0.3350, 32.5950)` when `last_known_location` is NULL

### What needs to be built
1. `api.updateCollectorLocation(token, lat, lng)` in `api.ts`
2. "Start route" button on collector dashboard that:
   - Requests `navigator.geolocation.getCurrentPosition()`
   - On success: calls `PATCH /collectors/me/location`, then fetches optimized route
   - On denial/error/timeout: notifies user, falls back to cached route without blocking
3. Must not continuously poll geolocation — one-shot check-in only

### Offline handling
- If offline when "Start route" pressed: skip location update, use cached route from last fetch
- Already existing: IndexedDB queue handles collection actions; route display is read-only (no queue needed)

---

## 3. Map Library

### Current state
- `package.json`: No mapping library installed (`next`, `react`, `react-dom` only in dependencies)
- Only map-related code: `ZoneDrawer.tsx` — SVG canvas with fixed Kampala bbox, no tiles
- No Leaflet, Mapbox, Google Maps, react-map-gl, or any tile-based library

### Decision
**Leaflet** via `react-leaflet` is the right choice:
- Open-source (BSD-2)
- Works with OpenStreetMap tiles (no API key required, no cost for pilot scale)
- `react-leaflet` is the standard Next.js-compatible React wrapper
- Supports polygons (zones), markers (bins, complaints, pickups, collectors), clusters
- No proprietary platform dependency
- Lightweight (~42KB gzipped for Leaflet core)

**Tile provider:** OpenStreetMap standard tiles (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)
- Free, no API key
- Attribution required: `© OpenStreetMap contributors`
- Usage policy: fair use for pilot scale

**Dependencies to add:**
- `leaflet` — map engine
- `react-leaflet` — React bindings
- `@types/leaflet` — TypeScript types
- `leaflet.markercluster` — cluster large sets of markers (optional for pilot scale)

### SSR consideration
Leaflet requires `window` and is not SSR-compatible. Must use `dynamic(() => import(...), { ssr: false })` in Next.js.

---

## 4. Map Data Availability

All required geographic data already exists in PostGIS:

| Layer | Source | Shape | API |
|---|---|---|---|
| Zones | `collection_zones.boundary` | POLYGON | `GET /zones` (no geometry returned — needs extension) |
| Bins | `bins.location` | POINT | `GET /bins/nearby` (lat/lng returned ✅) |
| Complaints | `complaints.location` | POINT | `GET /complaints` (lat/lng returned ✅) |
| Pickups | `pickup_requests.location` | POINT | Not exposed in list endpoints |
| Hotspots | Computed centroid | POINT | `GET /operations/hotspots` ✅ |
| Collector location | `collectors.last_known_location` | POINT | `GET /collectors/me` (lat/lng returned ✅) |

**Gap 1:** Zone boundaries are POLYGON geometry stored in PostGIS but `GET /zones` only returns `{id, name, waste_company_id, is_active}` — no coordinates. Need to add GeoJSON boundary to the zone list/detail endpoint.

**Gap 2:** `GET /complaints` does not include lat/lng in its admin list endpoint (`list_complaints`). The `_out()` function includes lat/lng but the admin list uses it ✅ — confirmed in `complaints.py`.

**Gap 3:** No map-optimised endpoint that returns all operational map data in a single request with bounding-box filtering. For pilot scale (< 200 entities total), individual layer requests are fine.

---

## 5. New Map API Endpoints Needed

| Endpoint | Data | Notes |
|---|---|---|
| `GET /operations/map-layers` | Zones (GeoJSON), bins, complaints, hotspots | Combined map data request, auth-scoped |
| Update: `GET /zones` or new `GET /zones/geojson` | Zone boundaries as GeoJSON polygon | Required for map display |

The zones endpoint needs to return boundary coordinates. The existing `CollectionZone.boundary` stores a PostGIS Polygon — use `ST_AsGeoJSON(boundary)` to extract it.

---

## 6. Existing APIs That Can Be Reused Without Changes

- `GET /operations/hotspots` — returns centroid lat/lng ✅ → map markers
- `GET /complaints` — returns lat/lng ✅ → map markers  
- `GET /bins/nearby?latitude=&longitude=&radius_meters=20000` — returns lat/lng + fill ✅ → map markers
- `GET /collectors` — returns lat/lng ✅ (company-scoped) → company map markers
- `GET /collectors/me` — returns own lat/lng ✅ → collector self-marker

---

## 7. Performance Assessment

### Current priority queue
Loads all REQUESTED/ASSIGNED pickups into Python, then loops. For pilot scale (< 100 active pickups), this is fine. With full scoring (ST_DWithin per pickup), the naive approach is O(N) queries. **Must batch into a single SQL query.**

### Zone performance
One query per active zone (confirmed in code). For 3–10 zones at pilot scale, acceptable. At 50+ zones, rewrite as a single lateral join.

### Map at pilot scale
With the Phase 2 seed (17 complaints, 16 bins, 3 zones, 100+ pickups), individual layer requests are acceptable. Clustering is recommended for complaints but not critical at this scale.

### Spatial indexes
All PostGIS geometry columns have GIST indexes from the initial migration — confirmed in `migrations/versions/453f4faf0ef0`. No new indexes needed for the ST_DWithin priority scoring at pilot scale.

---

## 8. Security Gaps to Address

- Zone boundaries as GeoJSON expose geographic operational data — must enforce RBAC (COMPANY_ADMIN scoped to own zones)
- Map endpoints must not expose cross-tenant data
- Collector location via `GET /collectors` is already scoped to COMPANY_ADMIN's company
- `GET /collectors/me/location` only returns own collector's location

---

## 9. Frontend Gaps

| Gap | Impact | Fix |
|---|---|---|
| No map library | No map possible | Install react-leaflet |
| ZoneDrawer has fixed Kampala bbox | Can't draw zones outside range | Not blocking for pilot |
| Collector page never calls `PATCH /collectors/me/location` | Route uses default Kampala centre | Add Start Route workflow |
| Priority queue items show score but not score breakdown | Operators can't understand why | Add score explanation fields |

---

## 10. Proposed Implementation Sequence

**Phase A — Priority scoring (backend, highest impact)**
1. Add `NEARBY_RADIUS_METERS` to `Settings`
2. Batch spatial query in `operational_service.py` for nearby complaints + nearest bin fill
3. Update `get_priority_pickup_queue()` and `get_overdue_pickups()` to pass real values
4. Add score explanation fields to response (`score_breakdown`)
5. Add backend tests

**Phase B — Zone GeoJSON (backend, needed for map)**
1. Add `GET /zones/geojson` endpoint returning zone boundaries
2. OR extend existing `GET /zones` with optional `include_geometry=true` param

**Phase C — Map infrastructure (frontend)**
1. Install `leaflet`, `react-leaflet`, `@types/leaflet`
2. Create `MapView` component with SSR-safe dynamic import
3. Add to admin dashboard as a new "Map" tab
4. Zone + complaint + bin + hotspot layers

**Phase D — Collector location workflow (frontend)**
1. Add `api.updateCollectorLocation()` to `api.ts`
2. Add "Start route" button to collector page with geolocation flow
3. Handle all error states (denied, timeout, offline, network)

**Phase E — Priority explanations (frontend)**
1. Update admin priority queue tab to show score breakdown

**Phase F — Tests and documentation**
1. Backend tests for real priority scoring
2. Pilot documentation

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Leaflet SSR issues in Next.js | Medium | Use `dynamic(..., {ssr: false})` — standard pattern |
| OpenStreetMap tile rate limiting | Low | Pilot scale is well within OSM fair-use policy |
| ST_DWithin in batch query complexity | Medium | Test query plan; PostGIS GIST indexes handle this well |
| Geolocation permission denied by collector | Medium | Graceful fallback, clear user message |
| Map breaks if tiles unavailable | Low | App remains functional; map tab shows error state |
