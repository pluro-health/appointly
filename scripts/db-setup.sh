#!/bin/sh
set -eu

DB_HOST="${DB_HOST:-postgres}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-appointly}"
DB_NAME="${DB_NAME:-appointly}"
WAIT_TIMEOUT="${WAIT_TIMEOUT:-120}"
SEED="${SEED:-false}"

echo "[db-setup] Waiting for Postgres at ${DB_HOST}:${DB_PORT} ..."
SECONDS=0
while ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; do
  [ "$SECONDS" -gt "$WAIT_TIMEOUT" ] && echo "[db-setup] ERROR: Postgres not ready in ${WAIT_TIMEOUT}s" && exit 1
  sleep 2
done
echo "[db-setup] Postgres is ready."

[ -n "${DATABASE_URL:-}" ] || { echo "[db-setup] ERROR: DATABASE_URL not set"; exit 1; }
echo "[db-setup] Using DATABASE_URL=${DATABASE_URL}"

echo "[db-setup] Running prisma migrate deploy..."
yarn workspace @calcom/prisma prisma migrate deploy

if [ "$SEED" = "true" ]; then
  echo "[db-setup] Seeding..."
  yarn workspace @calcom/prisma prisma db seed || echo "[db-setup] Seed skipped/not configured."
else
  echo "[db-setup] Skipping seed (SEED=false)."
fi

echo "[db-setup] Done."
