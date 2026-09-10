#!/bin/sh
# Bring the database up to date, then hand over to the server.
#
# Migrations are idempotent, so running them on every boot is safe and means a
# deploy never needs a separate "now go and migrate" step that someone forgets.
# If they fail, refuse to start: a server running against a schema it does not
# match will corrupt data far more expensively than a failed deploy.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. Labvia stores everything in Postgres and cannot start without one." >&2
  exit 1
fi

echo "Applying migrations..."
node scripts/migrate.mjs

echo "Starting Labvia on port ${PORT:-3001}"
exec "$@"
