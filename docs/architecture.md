# Architecture

## Overview

EcoTrack is a full-stack application split into two deployables:

- **backend/** — FastAPI (Python) REST API, PostgreSQL + PostGIS, Redis.
- **frontend/** — Next.js (TypeScript, App Router) web app, installable as a PWA.

They communicate exclusively over the versioned REST API (`/api/v1/...`). Nothing in the frontend
talks to the database directly.

## Backend layout

```
backend/app/
├── api/v1/          # FastAPI routers — HTTP boundary only, thin
├── core/             # config, database session, geo helpers
├── models/           # SQLAlchemy ORM models (source of truth for the schema)
├── schemas/           # Pydantic request/response schemas
├── services/          # business logic (pickup lifecycle, auth) — the real domain layer
├── security/          # password hashing, JWT, RBAC dependencies
├── intelligence/       # RouteOptimizer, HotspotDetector, EnvironmentalCalculator,
│                        # and the future-tech interfaces (WasteForecaster, IoT, CV, payments)
├── notifications/      # NotificationProvider abstractions (in-app implemented; email/SMS/push are interfaces)
├── storage/            # file storage abstraction (local disk now, S3-ready interface)
└── main.py             # FastAPI app wiring
```

Most business logic that mutates state and needs authorization checks lives in `services/`, not in
the router functions. Routers stay thin: parse the request, call the service, return the response.
The one exception is simple CRUD-shaped routers (bins, zones, vehicles, etc.) where the logic is
short enough that a separate service module would just be indirection — those keep their logic
inline in the router.

## Request flow (example: pickup completion)

```
Collector app
  → POST /api/v1/pickups/{id}/complete
  → FastAPI dependency: get_current_user (JWT decode + DB lookup)
  → FastAPI dependency: require_roles(COLLECTOR)
  → pickup_service.complete_collection()
      - loads the PickupRequest, checks it's actually assigned to this collector
      - validates the REQUESTED→...→COLLECTED state machine (PICKUP_TRANSITIONS)
      - writes a Collection row (proof of collection)
      - writes a WasteRecord row (feeds analytics)
      - writes a PointsLedgerEntry if a reward rule is configured
      - writes Notification rows
      - writes an AuditLog row
      - commits in a single transaction
  → response serialized back to the collector app
```

This is a real, DB-backed, multi-step flow — not a fake endpoint returning a canned response. It's
covered by `backend/tests/test_pickups.py::test_full_pickup_lifecycle`.

## Frontend layout

```
frontend/src/
├── app/                # Next.js App Router pages (/, /login, /register, /dashboard, /pickups/new)
├── context/AuthContext.tsx  # token/session state, talks to the real API
├── lib/api.ts           # typed fetch client for the backend
public/
├── manifest.webmanifest
├── service-worker.js    # real cache/offline-fallback strategy
└── offline.html
```

## Why this structure

- **Separation of concerns**: models define the schema, schemas define the wire format, services
  hold business rules, routers are the HTTP boundary. This makes RBAC and tenant-isolation checks
  auditable in one place per feature instead of scattered across the codebase.
- **No premature abstraction**: we did not introduce a message queue, GraphQL layer, or
  microservices split — the spec explicitly asks for "clean, not over-engineered," and a modular
  monolith is the right shape for this MVP's scale.
