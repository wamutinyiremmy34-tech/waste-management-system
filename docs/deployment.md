# Deployment

## Local development (Docker Compose)

```bash
cp backend/.env.example backend/.env    # edit SECRET_KEY at minimum
docker compose up --build
```

This starts: `db` (postgis/postgis:16-3.4), `redis`, `backend` (FastAPI on :8000, runs migrations
and optionally seeds on start via `SEED_ON_START=true`), `frontend` (Next.js production build on
:3000).

**Precise, tested status of the Docker path in this project's build environment**: Docker itself
was *not* preinstalled, but `apt-get install docker.io` succeeded and `dockerd` started and ran
correctly (`docker info` reports a healthy daemon, correct runtime, etc.). However, `docker build`
on this project's actual `backend/Dockerfile` fails at the very first `FROM python:3.12-slim` line
with `403 Forbidden` resolving `registry-1.docker.io` — confirmed universal by also failing to pull
`alpine:latest`. This environment's network egress allowlist includes package registries (PyPI,
npm, apt, GitHub) but **no container registry domains at all**, so no `docker pull`/`docker build
FROM <image>` can succeed here regardless of which base image is used. This is a definitive,
directly-tested finding — not a guess or an assumption that Docker "probably doesn't work."

The Dockerfiles and compose file themselves follow standard, conventional patterns and mirror the
exact commands (`pip install -r requirements.txt`, `alembic upgrade head`, `npm run build`) that
**were** verified working directly on the host in this environment. In an environment with normal
internet/registry access, `docker compose up --build` should work as written — but that specific
claim remains unverified here, and should be smoke-tested in a real deployment environment before
being relied upon.

## Local development (without Docker)

```bash
# 1. Postgres + PostGIS + Redis running locally (see README.md)

# 2. Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
python3 scripts/seed.py   # optional demo data
uvicorn app.main:app --reload

# 3. Frontend
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

This exact sequence (minus `--reload`/`dev` vs `start`) is what was actually run and verified in
this project — see `docs/testing.md` for what was tested.

## Environment variables

See `backend/.env.example` and `frontend/.env.example` — every variable is documented there.
`SECRET_KEY` **must** be changed from the default before any non-local use; the default is
explicitly labeled insecure.

## Production considerations (not implemented, called out honestly)

- No TLS termination / reverse proxy config is included — a real deployment needs nginx/Caddy/a
  cloud load balancer in front of both services.
- No horizontal-scaling guidance (this MVP runs as single backend/frontend containers).
- No managed-database migration strategy (e.g. blue-green) beyond `alembic upgrade head`.
- `SECRET_KEY` and DB credentials should come from a secrets manager, not `.env` files, in
  production — `.env` here is for local development only.
