#!/usr/bin/env bash
# Gets LabFlow running from any starting state, and leaves the server up.
#
#   bash .devcontainer/setup.sh
#
# Safe to re-run. It will not reseed over data you already have.
set -uo pipefail
cd "$(dirname "$0")/../apps/labflow" || exit 1

# Container creation calls this with --no-start: it must return, not block on a
# server. A person running it by hand wants the server, so that is the default.
START=1
[ "${1:-}" = "--no-start" ] && START=0

# Recovery containers and some base images have no sudo, and may already be
# root. Use it only when it is both present and needed.
SUDO=""
[ "$(id -u)" != "0" ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

# Codespaces grants passwordless sudo only when the target user is root, so
# `sudo -u postgres` stops and asks for a password nobody has. Become root
# first, then su to postgres.
as_postgres () {
  local command
  command=$(printf '%q ' "$@")
  if [ -n "$SUDO" ]; then $SUDO su postgres -c "$command"; else su postgres -c "$command"; fi
}

reachable () {
  DATABASE_URL="$1" node -e "
    new (require('pg').Client)({ connectionString: process.env.DATABASE_URL })
      .connect().then((c) => process.exit(0)).catch(() => process.exit(1));
  " 2>/dev/null
}

if ! command -v npm >/dev/null 2>&1; then
  cat <<'NONODE'

  Node is not installed here.

  A prompt like  codespaces-xxxxx:/workspaces/...$  means the codespace fell
  back to recovery mode because the container failed to build. Rebuild it:

      Ctrl+Shift+P  ->  Codespaces: Rebuild Container

  Then run this script again. To carry on in recovery mode instead, install
  Node first:

      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
      export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm install 20

NONODE
  exit 1
fi

echo "==> 1/4  Installing dependencies (a few minutes the first time)"
npm install --no-audit --no-fund || exit 1

echo "==> 2/4  Finding a database"
# What .env.local already points at comes first: the app reads that file, so a
# URL discovered here that disagreed with it would migrate one database while
# the site talked to another.
ENV_URL=$(sed -n 's/^DATABASE_URL="\(.*\)"$/\1/p' .env.local 2>/dev/null | head -1)

URL=""
for candidate in \
  "$ENV_URL" \
  "${DATABASE_URL:-}" \
  "postgres://postgres:postgres@localhost:5432/labflow" \
  "postgres://postgres@localhost:5432/labflow" \
  "postgres://postgres:postgres@db:5432/labflow"
do
  [ -n "$candidate" ] || continue
  if reachable "$candidate"; then URL="$candidate"; break; fi
done

# A server may be up while the labflow database itself is missing. Create it
# rather than installing a second PostgreSQL beside the one already running.
if [ -z "$URL" ]; then
  for admin in \
    "postgres://postgres:postgres@localhost:5432/postgres" \
    "postgres://postgres@localhost:5432/postgres"
  do
    if reachable "$admin"; then
      echo "    Server is up but the labflow database is missing — creating it."
      DATABASE_URL="$admin" node -e "
        const { Client } = require('pg');
        const c = new Client({ connectionString: process.env.DATABASE_URL });
        c.connect()
          .then(() => c.query('create database labflow'))
          .then(() => c.end())
          .catch(() => process.exit(0));
      " 2>/dev/null
      URL="${admin%/postgres}/labflow"
      reachable "$URL" || URL=""
      [ -n "$URL" ] && break
    fi
  done
fi

# An installed-but-stopped PostgreSQL is the normal state after a container
# restart. Start it before reaching for the package manager.
if [ -z "$URL" ] && [ -d /etc/postgresql ]; then
  echo "    PostgreSQL is installed but stopped — starting it."
  $SUDO service postgresql start >/dev/null 2>&1
  as_postgres psql -qc "ALTER USER postgres PASSWORD 'postgres';" >/dev/null 2>&1
  as_postgres createdb labflow >/dev/null 2>&1
  for candidate in \
    "postgres://postgres:postgres@localhost:5432/labflow" \
    "postgres://postgres@localhost:5432/labflow"
  do
    if reachable "$candidate"; then URL="$candidate"; break; fi
  done
fi

if [ -z "$URL" ]; then
  echo "    None reachable — installing PostgreSQL here."
  # apt-get update exits non-zero if any single repository fails, which says
  # nothing about whether the package we want is available. Only the install
  # itself is worth failing on.
  $SUDO apt-get update -qq 2>&1 | tail -3
  $SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends postgresql || {
    echo "    Could not install PostgreSQL. Send me everything above this line."
    exit 1
  }
  $SUDO service postgresql start
  as_postgres psql -qc "ALTER USER postgres PASSWORD 'postgres';"
  as_postgres createdb labflow 2>/dev/null
  URL="postgres://postgres:postgres@localhost:5432/labflow"
  if ! reachable "$URL"; then
    echo "    PostgreSQL is installed but not accepting connections. Send me this output."
    exit 1
  fi
fi
echo "    Using ${URL//:postgres@/:****@}"

echo "==> 3/4  Writing .env.local"
if [ -f .env.local ] && [ -n "$ENV_URL" ] && [ "$ENV_URL" != "$URL" ]; then
  echo "    Its DATABASE_URL is unreachable — pointing it at the database we found."
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"$URL\"|" .env.local
elif [ ! -f .env.local ] || ! grep -q DATABASE_URL .env.local; then
  {
    printf 'DATABASE_URL="%s"\n\n' "$URL"
    printf '# Explore the whole paid product locally. Ignored in production.\n'
    printf 'LABFLOW_DISABLE_PAYWALL="1"\n\n'
    printf '# Optional. Without a key LabBot says so rather than inventing an answer.\n'
    printf 'ANTHROPIC_API_KEY=""\n'
  } > .env.local
  echo "    Created it."
else
  echo "    Already there — left alone."
fi

echo "==> 4/4  Migrating and seeding"
DATABASE_URL="$URL" npx tsx src/db/migrate.ts || exit 1
EXISTING=$(DATABASE_URL="$URL" node -e "
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.connect()
    .then(() => c.query('select count(*)::int as n from workspaces'))
    .then((r) => { console.log(r.rows[0].n); return c.end(); })
    .catch(() => console.log(0));
" 2>/dev/null | tail -1)
if [ "${EXISTING:-0}" = "0" ]; then
  DATABASE_URL="$URL" npx tsx src/db/seed.ts || exit 1
else
  echo "    You already have data — not replacing it."
fi

if [ "$START" = "0" ]; then
  echo ""
  echo "  Setup complete. Start LabFlow with:  bash .devcontainer/setup.sh"
  echo ""
  exit 0
fi

cat <<'MSG'

  Ready. Starting the server now.
  Click "Open in Browser" on the popup, then log in as:

      demo@labflow.test  /  demo-password-1

  Leave this terminal running. Ctrl-C stops the site.

MSG
exec npm run dev
