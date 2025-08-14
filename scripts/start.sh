#!/bin/sh
set -x


# Replace the statically built BUILT_NEXT_PUBLIC_WEBAPP_URL with run-time NEXT_PUBLIC_WEBAPP_URL
# NOTE: if these values are the same, this will be skipped.
scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"


# Initialize database if needed
if [ -f "/appointly/docker/init-db.sh" ]; then
   echo "🗄️  Running database initialization..."
   /appointly/docker/init-db.sh
else
   # Fallback to basic setup
   echo "⏳ Waiting for database..."
   scripts/wait-for-it.sh ${DATABASE_HOST:-database}:5432 -- echo "database is up"
  
   echo "🚀 Running database migrations..."
   npx prisma migrate deploy --schema /appointly/packages/prisma/schema.prisma
fi


# Start the application
echo "Starting Appointly application..."
yarn start






