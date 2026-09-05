# Running LabFlow on your own computer

**`localhost` means *your* machine.** If someone else ran the app on a server,
`http://localhost:3001` in your browser will not reach it — you have to run it
here. That is what this page is for.

## Once

You need [Node 20+](https://nodejs.org) and either Postgres or
[Docker Desktop](https://www.docker.com/products/docker-desktop/). Docker is
easier: the setup script starts a database for you.

```bash
cd apps/labflow
npm install
npm run setup      # finds or starts Postgres, migrates, offers demo data
npm run dev
```

Then open **http://localhost:3001**.

If you seeded the demo lab, log in as:

```
demo@labflow.test
demo-password-1
```

Otherwise go to `/signup` and make your own workspace.

`npm run setup` is safe to re-run. It never overwrites an existing
`.env.local`, and it asks before replacing your data.

## Exploring the paid product

`npm run setup` writes `LABFLOW_DISABLE_PAYWALL="1"` into `.env.local`, so
every screen is reachable without paying. That flag is ignored when
`NODE_ENV=production`, so it cannot ship as a backdoor.

To see what a customer sees instead, set it to `""` and restart. Then:

| To see | Do this |
|---|---|
| The free plan | `update workspace_subscriptions set status='none';` |
| A trial ending soon | `update workspace_subscriptions set status='trialing', trial_ends_at=now()+interval '2 days';` |
| Read-only lockout | `update workspace_subscriptions set status='canceled';` |
| A paid workspace | `update workspace_subscriptions set status='active', plan='lab';` |

Run those with `psql "$DATABASE_URL"`. Read-only never deletes anything —
pages stay readable and only writing is refused.

## If something goes wrong

**`npm run setup` says no Postgres and no Docker** — install Docker Desktop and
run it again, or start Postgres yourself and put its URL in `.env.local` as
`DATABASE_URL`.

**Port 3001 already in use** — `npm run dev -- -p 3002`.

**Nothing loads at localhost:3001** — check the terminal running `npm run dev`
is still going and shows no error. It must stay open.

**Changed `.env.local`** — restart `npm run dev`; environment variables are
read at startup.
