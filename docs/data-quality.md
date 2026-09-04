# Data Quality Audit

This document records data quality findings from the Phase 2 audit. No historical data was silently
altered. Findings are documented, safe corrections are noted, and validations added where appropriate.

---

## Findings

### DQ-1 — `collections.collector_id` nullable inconsistency (FIXED)

**Finding:** The `collections` table had `collector_id` declared `NOT NULL` in the SQLAlchemy model
but the FK constraint used `ondelete=SET NULL`. If a `Collector` row were deleted, the FK operation
would fail with a NOT NULL violation rather than setting the field to NULL.

**Severity:** Medium — no data corruption, but would cause a DB error on collector deletion.

**Fix:** Migration `a1b2c3d4e5f6` changed `collector_id` to `nullable=True`. SQLAlchemy model updated
to `Mapped[uuid.UUID | None]`. Historical data unaffected (no NULLs existed).

---

### DQ-2 — `Complaint.assigned_to_user_id` never populated (DOCUMENTED)

**Finding:** The `assigned_to_user_id` column exists in the schema and migration but is never set
by any API endpoint. The complaint workflow transitions (REPORTED → UNDER_REVIEW → ASSIGNED →
IN_PROGRESS → RESOLVED) don't capture the assigning admin's ID.

**Severity:** Low — no data corruption. The field is structurally correct; it just has no write path.

**Fix:** No silent data alteration. The field is documented as unpopulated in this phase. A Phase 3
improvement would capture the assigning admin ID when transitioning to ASSIGNED status.

---

### DQ-3 — `Bin.last_collected_at` never updated (DOCUMENTED)

**Finding:** The `last_collected_at` column on `bins` is never updated by any collection workflow.
When a pickup is completed, the linked bin (if any) is not updated.

**Severity:** Low — the field exists in the schema but has no data. Any analytics using this field
would show NULL for all bins.

**Fix:** Not fixed in this phase. Would require linking `PickupRequest` → `Bin` and updating on
collection completion. No existing feature depends on this field.

---

### DQ-4 — Seed data had insufficient volume for intelligence features (FIXED)

**Finding:** The original seed script created:
- 1 complaint → hotspot detector produces 0 clusters (needs ≥3 per cluster)
- 1 waste record → analytics shows only 1 category with 18.5 kg
- 0 points ledger entries → leaderboard empty
- 0 time spread → no trends possible

**Severity:** High for Phase 2 intelligence features (makes them appear broken on a fresh install).

**Fix:** Seed script rebuilt with 100+ pickups over 35 days, 17 complaints in 2 geographic clusters,
30 days of recycling records, and points entries. Existing entities (real Kampala coordinates, Ugandan
names, KCCA reference) preserved.

---

### DQ-5 — `OrganizationLocation` has write endpoint but no read endpoint (FIXED)

**Finding:** `POST /organizations/{id}/locations` creates locations, but no corresponding
`GET /organizations/{id}/locations` endpoint existed. Stored locations were inaccessible via API.

**Severity:** Medium — users could add locations but never see them.

**Fix:** `GET /organizations/{id}/locations` added to `organizations.py`. Same RBAC as the write
endpoint (ORGANIZATION_ADMIN sees own org; SUPER_ADMIN/MUNICIPAL_ADMIN see any).

---

### DQ-6 — `analytics.waste_by_category` had no scoping for COMPANY_ADMIN (FIXED)

**Finding:** `GET /analytics/waste-by-category` aggregated across ALL waste records regardless of
which company the COMPANY_ADMIN belongs to. A COMPANY_ADMIN could see other companies' waste totals.

**Severity:** Medium — information disclosure across tenant boundary.

**Fix:** Added automatic `waste_company_id` scoping when `current_user.role == COMPANY_ADMIN`.
Added `date_from`/`date_to`/`company_id` query params.

---

### DQ-7 — `companies.dashboard` `pending_pickups` counted only ASSIGNED (DOCUMENTED)

**Finding:** `GET /companies/{id}/dashboard` returned `pending_pickups` as a count of pickups in
ASSIGNED status only. Pickups in REQUESTED status (unassigned backlog) were invisible to COMPANY_ADMIN.

**Severity:** Medium — operational blind spot.

**Fix:** Phase 2 operational summary exposes `unassigned_backlog` (REQUESTED count) separately.
The company dashboard now displays this via `GET /operations/operational-summary`. The old
`pending_pickups` field in `/companies/{id}/dashboard` is unchanged for backward compatibility.

---

## Validations Added

| Validation | Where | What it catches |
|---|---|---|
| `quantity_kg > 0` | `schemas/pickup.py` `CollectionCompleteRequest` | Negative or zero collection weights |
| `latitude` bounds `[-90, 90]`, `longitude` bounds `[-180, 180]` | All schemas with lat/lng | Impossible coordinates |
| `description` min/max length | `complaints.py` inline schema | Empty or excessively long complaint text |
| `password` strength (digit + letter, min 8) | `schemas/auth.py` | Weak passwords on registration and reset |
| `min_length=4` on zone `boundary_coordinates` | `zones.py` | Degenerate polygons |
| Closed ring check `coords[0] == coords[-1]` | `zones.py` | Non-closed polygon |

---

## No Automatic Data Alteration

Historical data in `pickup_requests`, `collections`, `waste_records`, `complaints`, and all other
tables was NOT modified. Corrections were:
1. Schema/constraint fixes (nullable change) applied via migration with no data change
2. New endpoints added to access existing data
3. Seed script updated (affects only fresh installs or reseeds, not existing deployments)

If you are upgrading an existing deployment, run `alembic upgrade head` to apply migration
`a1b2c3d4e5f6`. No existing data is affected.
