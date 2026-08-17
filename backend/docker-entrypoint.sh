#!/bin/sh
set -e

echo "Waiting for database..."
until python3 -c "
import psycopg2, os, sys
try:
    psycopg2.connect(os.environ.get('DATABASE_URL', '').replace('postgresql+psycopg2', 'postgresql'))
except Exception as e:
    sys.exit(1)
"; do
  sleep 1
done
echo "Database is up."

echo "Running migrations..."
alembic upgrade head

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding demo data..."
  python3 scripts/seed.py || true
fi

exec "$@"
