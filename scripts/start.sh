#!/bin/sh
set -x

# Replace the statically built BUILT_NEXT_PUBLIC_WEBAPP_URL with run-time NEXT_PUBLIC_WEBAPP_URL
# scripts/replace-placeholder.sh "$BUILT_NEXT_PUBLIC_WEBAPP_URL" "$NEXT_PUBLIC_WEBAPP_URL"

# Optional init script (creates DB if missing, seeds, etc.)
if [ -f "/appointly/init-db.sh" ]; then
  echo "🗄️  Running database initialization..."
  chmod +x /appointly/init-db.sh
  /appointly/init-db.sh
else
  echo "🚀 Running database migrations..."
  npx prisma migrate deploy --schema /appointly/packages/prisma/schema.prisma
fi

echo "Starting Appointly application..."
yarn start
