#!/usr/bin/env bash
set -euo pipefail

# Require critical envs (fail fast if missing)
: "${DATABASE_HOST:?DATABASE_HOST is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

echo "🗄️  Initializing Appointly database..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h "${DATABASE_HOST}" -p "${DATABASE_PORT:-5432}" -U "${POSTGRES_USER}" >/dev/null 2>&1; do
  echo "PostgreSQL is not ready yet. Waiting..."
  sleep 2
done
echo "✅ PostgreSQL is ready!"

# Check if database exists, create if it doesn't
echo "🔍 Checking if database ${POSTGRES_DB} exists..."
export PGPASSWORD="${POSTGRES_PASSWORD}"
if ! psql -h "${DATABASE_HOST}" -U "${POSTGRES_USER}" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" | grep -q 1; then
  echo "📝 Creating database: ${POSTGRES_DB}"
  createdb -h "${DATABASE_HOST}" -U "${POSTGRES_USER}" "${POSTGRES_DB}"
else
  echo "✅ Database ${POSTGRES_DB} already exists."
fi

# Run migrations
echo "🚀 Running database migrations..."
npx prisma migrate deploy --schema /appointly/packages/prisma/schema.prisma

# Seed (optional; comment out if not needed every boot)
echo "🌱 Seeding app store..."
npx ts-node --transpile-only /appointly/packages/prisma/seed-app-store.ts

echo "✅ Database initialization complete!"
