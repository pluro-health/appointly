#!/bin/sh
set -x

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
