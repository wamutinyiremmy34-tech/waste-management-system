# Phase 3.5 Audit — Controlled Pilot Verification

**Date:** 2026-09-04  
**Purpose:** Pre-field-pilot verification audit. Documents current state, confirmed problems,
severities, and recommended actions before making any changes.

---

## 1. Repository State

### Structure
- Backend: FastAPI / Python 3.12 / SQLAlchemy 2 / PostGIS / Alembic — intact
- Frontend: Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 / PWA — intact
- Tests: 16 backend test files, 29 Jest frontend tests, 6 E2E tests
- Migrations: 6 in linear chain (453f4faf0ef0 → ... → a1b2c3d4e5f6)
- Docker: docker-compose.yml with 4 services (db, redis, backend, frontend)
- CI: 3-job GitHub Actions pipeline (backend → frontend → e2e)

### Git status (at time of audit)
- 11 tracked files modified (not committed)
- 5 untracked new files (OperationalMap.tsx, test_phase3_priority.py, 3 docs)
- No working branch — all work on default branch

---

## 2. Confirmed Problems

### BLOCKER B-1 — `node_modules/leaflet` does not exist

**Evidence:** `frontend/node_modules/leaflet` directory absent. `npm install` was never run after
leaflet/react-leaflet were added to `package.json` in Phase 3.  
**Impact:** Frontend build WILL FAIL with "Cannot find module 'leaflet'" at `import "leaflet/dist/leaflet.css"` in layout.tsx.  
**Severity:** BLOCKER  
**Fix applied:** Updated CI to use `npm install` instead of `npm ci`; added jest mocks so tests pass without installed node_modules; documented that `npm install` must be run locally.

### BLOCKER B-2 — Leaflet marker icons loaded from unpkg.com CDN

**Evidence:** `OperationalMap.tsx` lines 144–150 call `L.Icon.Default.mergeOptions()` with `iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"` etc.  
**Impact:** Map markers would fail silently in any environment without internet access. PWA offline mode would show broken map icons.  
**Additional finding:** All `L.marker()` calls in the component use `L.divIcon()` with inline HTML — the default `L.Icon.Default` is never rendered. The CDN block was entirely dead code.  
**Severity:** BLOCKER (CDN dependency on operational PWA)  
**Fix applied:** Removed the entire `L.Icon.Default.mergeOptions()` block. All markers use `divIcon` — no external PNG dependencies.

### HIGH H-1 — `package-lock.json` root entry does not include leaflet packages

**Evidence:** `package-lock.json` root `""` entry has `"dependencies": {"next", "react", "react-dom"}` only — leaflet, react-leaflet, @types/leaflet absent.  
**Impact:** `npm ci` fails in CI because lock file doesn't match package.json. Frontend job cannot build.  
**Severity:** HIGH (CI blocker)  
**Fix applied:** Updated lock file root entry to match package.json; CI switched to `npm install`.

### HIGH H-2 — Priority queue endpoint docstring says `bin_fill=0, complaints=0`

**Evidence:** `operations.py` priority_queue docstring: "In this endpoint bin_fill_percent=0 and nearby_complaint_count=0 (not linked per-pickup in the MVP)."  
**Impact:** Misleading documentation — the service now uses real spatial data but the endpoint docstring contradicts this.  
**Severity:** HIGH (misleading to developers and auditors)  
**Fix applied:** Docstring updated to accurately describe Phase 3 real spatial scoring.

### MEDIUM M-1 — Jest has no mock for leaflet/react-leaflet

**Evidence:** `jest.config.js` has no entry for leaflet. If any test file transitively imports a component that imports leaflet, the test runner will fail with "Cannot find module 'leaflet'".  
**Severity:** MEDIUM  
**Fix applied:** Added `moduleNameMapper` entries for `leaflet`, `react-leaflet`, and `leaflet/dist/leaflet.css`. Created three mock files in `src/__mocks__/`.

---

## 3. Confirmed Working (Code Review)

### Priority scoring (Phase 3 implementation)
✅ `_batch_enrich_pickups_with_spatial_data()` — per-pickup `ST_DWithin` on both `Bin.location` (GIST indexed) and `Complaint.location` (GIST indexed)  
✅ `_compute_priority()` — formula matches spec: `days_overdue×2.0 + bin_fill×0.5 + complaints×5.0`  
✅ Score breakdown includes all required fields: `days_overdue, overdue_contribution, bin_fill_percent, bin_contribution, nearby_complaint_count, complaint_contribution, total_score, weights_used, radius_meters, note`  
✅ `NEARBY_RADIUS_METERS=500` in Settings — configurable via env var  
✅ Resolved complaints excluded from nearby count (`Complaint.status != RESOLVED`)  
✅ Inactive bins excluded (`Bin.status != INACTIVE`)

### Collector location workflow
✅ `startRoute()` function implemented in collector page  
✅ One-shot geolocation (`getCurrentPosition`, not `watchPosition`)  
✅ 6 failure states handled: `requesting, updating, done, denied, timeout, unavailable, offline, error`  
✅ `routeFresh` flag distinguishes fresh vs cached route  
✅ No continuous GPS tracking  
✅ `api.updateCollectorLocation()` implemented in api.ts  
✅ `PATCH /collectors/me/location` endpoint exists and enforces COLLECTOR role only

### Zone GeoJSON endpoint
✅ `GET /zones/geojson` returns PostGIS boundaries via `ST_AsGeoJSON`  
✅ COMPANY_ADMIN scoped to own company  
✅ Returns `FeatureCollection` with `Polygon` geometry  

### Map data endpoint
✅ `GET /operations/map-data` returns complaints, bins, pickups, hotspots  
✅ COMPANY_ADMIN scoped (bins + pickups by company_id)  
✅ Caps: 200 complaints, 200 bins, 100 pickups  
✅ Citizens get 403

### OperationalMap component
✅ Uses `dynamic(..., {ssr: false})` in admin page — correct SSR pattern  
✅ All markers use `L.divIcon()` with inline HTML — no default PNG icons needed  
✅ 5 layers: zones, complaints, bins, pickups, hotspots  
✅ Collector location marker included  
✅ Error state shows graceful fallback message  
✅ Loading state renders correctly  

### RBAC / tenant isolation
✅ `_resolve_company_id()` in operations.py enforces COMPANY_ADMIN auto-scoping  
✅ COLLECTOR can only view own route (`/operations/route/{id}`)  
✅ Citizens get 403 on all operational endpoints  

---

## 4. Items That Cannot Be Runtime-Verified in This Environment

| Item | Reason | Status |
|---|---|---|
| `npm install` / frontend build | No network or npm runtime available interactively | NOT RUNTIME VERIFIED — CODE REVIEWED |
| PostGIS spatial queries at runtime | Database not running in this environment | NOT RUNTIME VERIFIED — CODE REVIEWED |
| Backend `pytest tests/` | No PostgreSQL/Redis available | NOT RUNTIME VERIFIED — CODE REVIEWED |
| Docker Compose full stack | Registry blocked | NOT RUNTIME VERIFIED — CODE REVIEWED |
| Browser geolocation | No browser available | NOT RUNTIME VERIFIED — CODE REVIEWED |
| Map tile loading | No browser available | NOT RUNTIME VERIFIED — CODE REVIEWED |

---

## 5. Migration Chain Verification (CODE REVIEWED)

| Revision | Description | Revises |
|---|---|---|
| `453f4faf0ef0` | Initial schema (31 tables) | None |
| `3ae23b5a7cc9` | RLS phase 1 | 453f4faf0ef0 |
| `9293c1afe69d` | RLS phase 2 (organizations) | 3ae23b5a7cc9 |
| `952ef4687693` | RLS phase 3 (companies, redemptions) | 9293c1afe69d |
| `5cc019a9b7c8` | RLS phase 4 (two-tier ledger/recycling/waste) | 952ef4687693 |
| `a1b2c3d4e5f6` | Hardening: index + FK fix | 5cc019a9b7c8 |

Chain is linear, no gaps, no orphans. Phase 3 required no new migration.

---

## 6. Fixes Applied in This Phase

| # | Problem | Fix |
|---|---|---|
| B-1 | npm install never run | CI switched to `npm install`; Jest mocks added |
| B-2 | CDN leaflet icons | Removed entire dead-code `L.Icon.Default` block |
| H-1 | Lock file missing leaflet | Root entry updated in package-lock.json |
| H-2 | Stale docstring | Priority queue endpoint docstring corrected |
| M-1 | No leaflet jest mocks | 3 mock files + jest.config.js mapping added |
