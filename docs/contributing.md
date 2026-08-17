# Contributing

## Local setup

See the root `README.md` for the full install/run instructions (Docker and non-Docker paths).

## Code layout conventions

- Backend business logic that mutates state and needs authorization checks belongs in
  `app/services/`, not directly in router functions. Simple CRUD-shaped routers may keep logic
  inline — see `docs/architecture.md` for the reasoning.
- Every new model needs an Alembic migration (`alembic revision --autogenerate -m "..."`) — never
  hand-edit the database schema outside of migrations.
- Every new geometry column should use `geoalchemy2.Geometry(geometry_type=..., srid=4326)`, not
  raw lat/lng float columns (see `docs/postgis.md`).
- Every new protected endpoint needs an explicit `Depends(get_current_user)` or
  `Depends(require_roles(...))` — there is no "default deny" middleware, so a forgotten dependency
  means an unprotected endpoint. Consider this the single most important review checklist item for
  new endpoints.
- Tenant-scoped endpoints need an explicit ownership check (see `docs/multi-tenancy.md`) in addition
  to the role check.

## Before opening a PR

```bash
cd backend && ruff check app tests && pytest tests/ -v
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

All four should pass. CI (`.github/workflows/ci.yml`) runs the same checks.

## Commit hygiene

- Never commit `.env` (only `.env.example`).
- Never commit real credentials, even for "obviously fake" seed/demo accounts — keep those
  documented in `scripts/seed.py` and `README.md`, generated at seed time, not hardcoded secrets
  checked into history.
