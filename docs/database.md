# Database

PostgreSQL 16 + PostGIS 3.4. Schema is managed exclusively through Alembic migrations —
`Base.metadata.create_all()` is never used against a real environment (only in test setup, where
tests own a disposable database).

## Core tables (31 total)

| Domain | Tables |
|---|---|
| Identity | `users`, `refresh_tokens`, `password_reset_tokens` |
| Tenancy | `organizations`, `organization_locations`, `waste_companies`, `recycling_partners` |
| Operations | `collectors`, `vehicles`, `vehicle_maintenance_records`, `collection_zones` |
| Pickup lifecycle | `recurring_schedules`, `pickup_requests`, `collections`, `waste_records` |
| Bins & complaints | `bins`, `complaints`, `complaint_attachments` |
| Recycling & rewards | `recycling_records`, `reward_rules`, `points_ledger_entries`, `rewards`, `reward_redemptions`, `campaigns`, `campaign_participations` |
| Notifications & audit | `notifications`, `notification_preferences`, `audit_logs` |
| Files | `file_assets` |

## Geometry columns (real PostGIS, SRID 4326)

| Table | Column | Type |
|---|---|---|
| `organizations` | `location` | POINT |
| `organization_locations` | `location` | POINT |
| `recycling_partners` | `location` | POINT |
| `collectors` | `last_known_location` | POINT |
| `collection_zones` | `boundary` | POLYGON |
| `recurring_schedules` | `location` | POINT |
| `pickup_requests` | `location` | POINT |
| `collections` | `collection_location` | POINT |
| `waste_records` | `location` | POINT |
| `bins` | `location` | POINT |
| `complaints` | `location` | POINT |

Every geometry column has a GiST spatial index, created automatically by GeoAlchemy2 at table
creation (see `docs/postgis.md` for why these are *not* also declared in Alembic migrations).

## Key design decisions

- **UUID primary keys** everywhere (`uuid4`), so IDs are non-guessable and safe to expose in URLs —
  this also closes off a class of enumeration attacks against tenant-scoped resources.
- **Soft multi-tenancy via foreign keys**, not separate schemas/databases per tenant. `organization_id`
  / `waste_company_id` / `recycler_id` columns scope data, and isolation is enforced at the service
  layer (see `docs/multi-tenancy.md`), not by the database alone. This keeps operations simple for an
  MVP while still being tested and enforced.
- **`PICKUP_TRANSITIONS` and complaint status transitions are enforced in code**, not database
  constraints/triggers — this keeps the state machine readable and testable in Python, at the cost of
  not being enforceable if something writes to the table outside the API (acceptable for this MVP;
  a CHECK constraint or trigger could be added later without changing the API).
- **`WasteRecord` is decoupled from `PickupRequest`** so companies/organizations can log waste
  independent of the pickup flow (e.g. bulk weigh-ins at a transfer station), while pickups still
  produce a `WasteRecord` automatically on completion.

## Migrations

```bash
cd backend
alembic revision --autogenerate -m "description"
alembic upgrade head
```

The single migration currently in `backend/migrations/versions/` creates the full schema. Future
schema changes should be additional migrations, not edits to the existing one.
