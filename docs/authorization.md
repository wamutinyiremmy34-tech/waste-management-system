# Authorization (RBAC)

RBAC is enforced at the API/service layer — **never** by hiding frontend buttons (spec section 8).
A request from `curl` with a valid CITIZEN token hits exactly the same checks as a request from the
web app.

## Roles

`CITIZEN`, `COLLECTOR`, `COMPANY_ADMIN`, `ORGANIZATION_ADMIN`, `RECYCLER`, `MUNICIPAL_ADMIN`,
`SUPER_ADMIN` (`app/models/enums.py::UserRole`). Adding a new role means adding one enum value and
updating the relevant `require_roles(...)` calls — no schema migration needed for the role itself
(it's a single enum column).

## Mechanism

Every protected endpoint depends on one of:

- `get_current_user` — any authenticated user.
- `require_roles(UserRole.X, UserRole.Y, ...)` — a dependency factory that 403s unless the caller's
  role is in the allowed set.

```python
@router.post("/{pickup_id}/assign", response_model=PickupOut)
def assign_pickup(
    ...,
    current_user: User = Depends(require_roles(UserRole.COMPANY_ADMIN, UserRole.MUNICIPAL_ADMIN, UserRole.SUPER_ADMIN)),
):
```

## Tenant/ownership isolation

Role checks alone aren't enough — a `COMPANY_ADMIN` at Company A must not be able to touch Company
B's vehicles, collectors, or pickups just because they share a role. This is checked explicitly in
each service/router, comparing the resource's tenant FK against `current_user.waste_company_id` /
`current_user.organization_id`. Helpers: `require_same_organization`, `require_same_waste_company`
in `app/security/dependencies.py`.

**Critically, unauthorized access returns 404, not 403**, when the alternative would reveal that a
resource exists (e.g. a citizen requesting another citizen's pickup by ID). This was verified with
an automated test (`test_citizen_cannot_view_another_citizens_pickup`) and manually over HTTP.

## Verified test matrix

| Check | Test |
|---|---|
| Citizen cannot self-assign a pickup | `test_full_pickup_lifecycle` (assign step) |
| Citizen cannot view another citizen's pickup (IDOR) | `test_citizen_cannot_view_another_citizens_pickup` |
| Collector cannot complete an unassigned pickup | `test_collector_cannot_complete_unassigned_pickup` |
| Citizen cannot create a bin | `test_citizen_cannot_create_bin` |
| Citizen cannot moderate complaints | `test_citizen_cannot_moderate_complaints` |
| Public registration cannot escalate to SUPER_ADMIN | `test_cannot_self_register_as_super_admin` |
| Protected endpoints reject missing/invalid tokens | `test_protected_endpoint_requires_token` |

All of the above pass against a real PostgreSQL+PostGIS database (`backend/tests/`), not mocks.
