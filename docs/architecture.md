# Architecture

## Overview

EcoTrack is a full-stack web platform for waste management operations in Uganda. It is designed
as a working MVP with production-grade security and a clear boundary between what is fully
implemented and what is stubbed for future phases.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client (Browser / PWA)                    │
│                    Next.js 16 — App Router — TypeScript          │
│               Tailwind CSS 4 · IndexedDB offline queue           │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS / Bearer JWT
┌──────────────────────────▼──────────────────────────────────────┐
│                     FastAPI Backend (Python 3.12)                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │  API v1    │  │  Services  │  │Intelligence│  │ Security  │ │
│  │ (16 routers│  │auth/pickup │  │route_opt   │  │JWT/bcrypt │ │
│  │  + health) │  │scheduler  │  │hotspot     │  │RLS deps   │ │
│  └────────────┘  └────────────┘  │env_impact  │  └───────────┘ │
│                                  └────────────┘                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │            SQLAlchemy 2.0 ORM  ·  Alembic migrations        ││
│  └─────────────────────────────────────────────────────────────┘│
└──────┬───────────────────────────────────────────────┬──────────┘
       │                                               │
┌──────▼──────────────────┐             ┌─────────────▼─────────┐
│  PostgreSQL 16 + PostGIS│             │    Redis 7             │
│  31 tables, 11 geometry │             │    Rate limiting        │
│  columns, 13 RLS tables │             │    (counters only)      │
└─────────────────────────┘             └───────────────────────┘
```

---

## Backend

**Framework:** FastAPI 0.141 on Python 3.12, served by Uvicorn.

**Structure:**
```
backend/app/
├── api/v1/          # 16 route modules, one per resource domain
├── core/            # config, database, geo utils, rate limiter, RLS, security headers
├── intelligence/    # route_optimizer, hotspot_detector, env_calculator, prioritizer
├── models/          # SQLAlchemy 2.0 declarative models (31 tables)
├── notifications/   # InAppNotificationProvider (real) + Email/SMS/Push (interfaces only)
├── schemas/         # Pydantic v2 request/response schemas
├── security/        # JWT creation/validation, RBAC dependencies
├── services/        # auth_service, pickup_service, scheduler_service, pdf_report_service
└── storage/         # local file storage provider (S3 interface stubbed)
```

**Key design decisions:**
- Services own business logic; routers are thin wrappers
- Pickup state machine (`PICKUP_TRANSITIONS`) enforced in service layer, not DB constraints
- Scheduler is a plain Python function, not a daemon — run via cron/systemd
- RLS session context set per-request via `SET app.*` PostgreSQL session variables
- Connection pool uses `RESET ALL` on checkin to prevent RLS context leakage between requests

---

## Frontend

**Framework:** Next.js 16 with App Router, React 19, TypeScript, Tailwind CSS 4.

**Authentication:** JWT stored in `localStorage`, auto-refreshed on 401 responses via the
API client's retry interceptor. Logout revokes the refresh token server-side.

**Offline support (collector workflow):**
- Service worker caches static assets and provides offline fallback
- IndexedDB queue (`offlineQueue.ts`) stores collector actions when offline
- `useOfflineQueue` hook flushes the queue on reconnect, in chronological order
- Conflict detection: 4xx from server marks the action as failed (not retried); network
  errors leave it queued for the next flush

**Role routing:** All 7 roles have dedicated pages. Role is determined server-side from
the JWT; the frontend redirects at `useEffect` time but never trusts role for data access.

---

## Database

**PostgreSQL 16 with PostGIS 3.4.** UUID primary keys throughout. Timestamps via mixin.

**Spatial columns (11):** All use SRID 4326 (WGS84 lat/lng). One POLYGON (zone boundaries),
ten POINTs (user/bin/collector locations, pickup locations, complaint locations).

**Migrations:** 5 Alembic migrations in sequence:
1. Initial schema (all 31 tables)
2. RLS phase 1 (5 tables)
3. RLS phase 2 (organizations)
4. RLS phase 3 (waste_companies, redemptions, participations)
5. RLS phase 4 (two-tier read/write for ledger, recycling, waste records)
6. Hardening (index on `assigned_collector_id`, fix `collections.collector_id` nullability)

---

## Intelligence Modules

| Module | Status | Algorithm |
|---|---|---|
| `RouteOptimizer` | ✅ Real | Nearest-neighbour (haversine distance) |
| `HotspotDetector` | ✅ Real | PostGIS `ST_ClusterDBSCAN` on complaint locations |
| `EnvironmentalImpactCalculator` | ✅ Real | DB aggregates + configurable CO2e factors |
| `CollectionPrioritizer` | ✅ Real | Weighted scoring (overdue days, fill %, complaint count) |
| `WasteForecaster` | ❌ Interface | Raises `NotImplementedError` — Phase 2 |
| IoT/sensor/CV/payment | ❌ Interface | Phase 3 |

---

## Security Architecture

**Defence-in-depth layers:**
1. JWT access token expiry (30 min) + rotating refresh tokens (14 days, stored as hashes)
2. RBAC enforced in `require_roles()` dependency — server-side, not UI-only
3. Tenant isolation checks in service layer (`require_same_organization`, `require_same_waste_company`)
4. PostgreSQL Row-Level Security on 13 tables via `ecotrack_app` restricted role
5. Rate limiting (Redis, per-IP, per-path)
6. Security headers on every response
7. Request correlation IDs for incident tracing

---

## Infrastructure

**Docker Compose services:** `db` (PostGIS), `redis`, `backend`, `frontend`.
- Frontend depends on backend health check passing before starting
- Backend depends on db and redis health checks

**CI/CD:** GitHub Actions — 3 sequential jobs: `backend` → `frontend` → `e2e`.
- Backend: lint (ruff), vulnerability scan (pip-audit), migrations, pytest
- Frontend: lint, vulnerability scan (npm audit), Jest, tsc, build
- E2E: full stack (PostGIS + Redis), 6 real browser tests via Selenium/WebKitGTK

**Scheduler:** `scripts/run_scheduler.py` — runs `materialize_due_schedules()` and exits.
Intended to be called daily via cron. Not a long-running daemon.
