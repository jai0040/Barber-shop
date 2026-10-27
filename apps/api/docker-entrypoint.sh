#!/bin/sh
set -e

echo "🚀 Starting Barber Shop API Container..."

# Wait for database if DATABASE_URL or MIGRATION_DATABASE_URL is provided
echo "🔄 Running database migrations..."
node dist/db/migrate-cli.js

# Optional: seed demo data if explicitly requested
if [ "$SEED_DEMO_DATA" = "true" ]; then
  echo "🌱 Seeding demo data..."
  node dist/cli-seed-demo.js || true
fi

# Optional: create initial platform admin user if requested
if [ -n "$PLATFORM_ADMIN_EMAIL" ] && [ -n "$PLATFORM_ADMIN_PASSWORD" ]; then
  echo "👤 Ensuring platform admin user exists..."
  node dist/cli-create-platform-admin.js || true
fi

echo "⚡ Starting API server on port ${PORT:-4000}..."
exec "$@"
