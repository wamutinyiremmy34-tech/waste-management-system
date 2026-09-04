# Deployment

## Quick start (Docker Compose — local development)

```bash
cp backend/.env.example backend/.env   # edit SECRET_KEY at minimum
docker compose up --build
```

This starts: `db` (postgis/postgis:16-3.4), `redis:7-alpine`, `backend` (FastAPI on :8000),
`frontend` (Next.js on :3000). The backend runs `alembic upgrade head` on every start.

The frontend waits for the backend health check to pass before starting (`depends_on:
condition: service_healthy`). The backend in turn waits for both `db` and `redis` to be healthy.

**Seed demo data (optional, development only):**
```bash
docker compose exec backend python3 scripts/seed.py
```
Never use `SEED_ON_START=true` in production — it creates demo accounts with known credentials.

### Docker status

The compose file and Dockerfiles follow standard conventions and mirror the commands
(`pip install -r requirements.txt`, `alembic upgrade head`, `npm run build`) verified working
directly. Network registry access is required to pull `python:3.12-slim` and `node:22-alpine`.
If your environment blocks container registry DNS, use a pre-pulled image or a local mirror.

---

## Local development (without Docker)

```bash
# Prerequisites: PostgreSQL + PostGIS running locally, Redis running

# 1. Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt    # for tests
cp .env.example .env
# Edit .env: at minimum set DATABASE_URL and SECRET_KEY
alembic upgrade head
python3 scripts/seed.py            # optional demo data
uvicorn app.main:app --reload      # http://localhost:8000

# 2. Frontend
cd frontend
npm install
# Create .env.local:
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1" > .env.local
npm run dev                        # http://localhost:3000
```

---

## Environment variables

See `backend/.env.example` — every variable is documented there.

**Critical production variables:**

| Variable | Required | Notes |
|---|---|---|
| `SECRET_KEY` | YES | Must be changed. App refuses to start in production with the default. |
| `APP_ENV` | YES | Set to `production`. Controls docs visibility, startup validation. |
| `DEBUG` | YES | Must be `false` in production. |
| `DATABASE_URL` | YES | Use the restricted `ecotrack_app` role for the app; superuser for migrations. |
| `CORS_ORIGINS` | YES | Set to your exact frontend domain(s). |
| `SEED_ON_START` | NO | Must NOT be `true` in production. |

---

## Running tests

```bash
# Backend (requires PostgreSQL + PostGIS + Redis)
cd backend
APP_ENV=testing pytest tests/ -v

# Frontend
cd frontend
npm test -- --ci
npx tsc --noEmit
npm run build

# E2E (requires full stack running)
cd e2e
pytest . -v
```

---

## Production deployment checklist

Before going live:

- [ ] `SECRET_KEY` is a real random value (not the default)
- [ ] `APP_ENV=production` and `DEBUG=false`
- [ ] `CORS_ORIGINS` is set to your actual domain
- [ ] `SEED_ON_START=false` (or omitted entirely)
- [ ] `DATABASE_URL` uses the restricted `ecotrack_app` role (not superuser)
- [ ] `ecotrack_app` role password has been changed from the dev default
- [ ] Migrations ran successfully: `alembic upgrade head`
- [ ] Health check passes: `GET /api/v1/health` returns `{"status":"ok"}`
- [ ] Swagger docs are not accessible: `GET /docs` returns 404
- [ ] Pre-deployment backup taken (see `docs/backup-and-recovery.md`)
- [ ] TLS/HTTPS configured on the reverse proxy

## Production considerations (not yet implemented)

- **TLS termination:** nginx/Caddy/cloud load balancer must sit in front of both services.
  The backend's HSTS header activates automatically when requests arrive over HTTPS.
- **Horizontal scaling:** This MVP is designed for single-instance deployment.
- **Secrets management:** `.env` files are for local dev. Production should use a secrets
  manager (AWS Secrets Manager, HashiCorp Vault, etc.) and inject values as environment
  variables at container runtime.
- **Managed database migrations:** Consider a migration lock (e.g. Alembic with a lock table)
  before running `alembic upgrade head` in a multi-instance deployment.

## Useful operational commands

```bash
# View backend logs
docker compose logs -f backend

# Run migrations manually
docker compose run --rm backend alembic upgrade head

# Open a DB shell
docker exec -it ecotrack_db psql -U ecotrack -d ecotrack_prod

# Restart the backend only
docker compose restart backend

# Full restart
docker compose down && docker compose up -d

# Stop without removing volumes
docker compose stop
```
