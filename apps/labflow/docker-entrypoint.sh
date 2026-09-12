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

# Uploads land on a mounted disk, and a mount brings its ownership from the
# host rather than from this image. Mounted for root, this non-root process
# cannot write to it, and nothing reveals that until a researcher drags in
# their first file and the upload fails in front of them. Find out now.
UPLOADS="${UPLOAD_DIR:-/data/uploads}"
if ! mkdir -p "$UPLOADS" 2>/dev/null || ! touch "$UPLOADS/.write-test" 2>/dev/null; then
  echo "Cannot write to $UPLOADS, so no file could ever be uploaded." >&2
  echo "The disk mounted there is owned by another user. Give it to uid 1001," >&2
  echo "or mount the disk somewhere writable and set UPLOAD_DIR to that path." >&2
  exit 1
fi
rm -f "$UPLOADS/.write-test"

echo "Applying migrations..."
node scripts/migrate.mjs

echo "Starting Labvia on port ${PORT:-3001}"
exec "$@"
