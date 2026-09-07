#!/usr/bin/env bash
# Runs once, when the codespace is created. Leaves it ready for `npm run dev`.
# Postgres is already up: compose waits on its healthcheck before starting us.
set -euo pipefail

cd "$(dirname "$0")/../apps/labflow"

npm install
npm run setup -- --seed

cat <<'MSG'

  LabFlow is set up. Start it with:

      cd apps/labflow && npm run dev

  A notification will offer to open port 3001 in your browser.
  Log in as  demo@labflow.test  /  demo-password-1

MSG
