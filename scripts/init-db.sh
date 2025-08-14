#!/bin/bash
set -e

echo "🗄️  Initializing Appointly database..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h ${DATABASE_HOST:-database} -p 5432 -U ${POSTGRES_USER:-appointly_user}; do
 echo "PostgreSQL is not ready yet. Waiting..."
 sleep 2
done

echo "✅ PostgreSQL is ready!"

# Check if database exists, create if it doesn't
echo "🔍 Checking if database exists..."
PGPASSWORD=${POSTGRES_PASSWORD:-appointly_password} psql -h ${DATABASE_HOST:-database} -U ${POSTGRES_USER:-appointly_user} -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB:-appointly}'" | grep -q 1 || {
   echo "📝 Creating database: ${POSTGRES_DB:-appointly}"
   PGPASSWORD=${POSTGRES_PASSWORD:-appointly_password} createdb -h ${DATABASE_HOST:-database} -U ${POSTGRES_USER:-appointly_user} ${POSTGRES_DB:-appointly}
}

echo "✅ Database ${POSTGRES_DB:-appointly} is ready!"

# Run migrations
echo "🚀 Running database migrations..."
npx prisma migrate deploy --schema /appointly/packages/prisma/schema.prisma

echo "🌱 Seeding app store..."
npx ts-node --transpile-only /appointly/packages/prisma/seed-app-store.ts

echo "✅ Database initialization complete!"