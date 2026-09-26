#!/bin/sh
# Bring the database up to date, then hand over to the server.
#
# Migrations are idempotent, so running them on every boot is safe and means a
# deploy never needs a separate "now go and migrate" step that someone forgets.
# If they fail, refuse to start: a server running against a schema it does not
# match will corrupt data far more expensively than a failed deploy.
set -e

if [ -n "${DATABASE_URL+x}" ] && [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is set, but to nothing. Paste the connection string in as its value." >&2
  exit 1
fi

if [ -z "${DATABASE_URL+x}" ]; then
  echo "DATABASE_URL is not set. Labvia stores everything in Postgres and cannot start without one." >&2

  # "Not set" alone sends people round the same loop: fix it, redeploy, same
  # line. Saying what the server *can* see tells a misspelled name apart from
  # variables that never reached this service at all. Names only, never
  # values: a connection string carries a password, and logs are read by more
  # people than the settings page is. RENDER_* are the host's own, so they are
  # left out rather than drowning the one line that matters.
  near=$(env | cut -d= -f1 | grep -v '^RENDER_' | grep -iE 'data|db|url|postgres|neon' | grep -v '^DATABASE_URL$' | sort -u | tr '\n' ' ')
  if [ -n "$near" ]; then
    echo "Related variables this server can see: $near" >&2
    echo "If one of those is meant to be DATABASE_URL, rename it to exactly that." >&2
  else
    echo "This server can see no variable that looks like a database setting at all," >&2
    echo "so the ones you added are not reaching it. Check they are on this service's" >&2
    echo "own Environment page and that you saved them." >&2
  fi
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
