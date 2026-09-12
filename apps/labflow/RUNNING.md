# Running Labvia

## The quickest way: run it in your browser, install nothing

GitHub Codespaces gives you a Linux machine in the cloud with the editor and a
terminal in a browser tab. This repository is configured for it, so the database
and the demo data are set up for you.

1. Go to <https://github.com/ranvit38-ops/Freelancing>
2. Switch the branch dropdown to `claude/labflow-product-spec-665sne`
3. Click the green **Code** button → **Codespaces** tab → **Create codespace**
4. Wait a few minutes. It installs dependencies and seeds the demo lab for you.
5. In the terminal at the bottom, run:

```bash
cd apps/labflow && npm run dev
```

6. A popup offers to **Open in Browser**. Click it. Log in as
   `demo@labflow.test` / `demo-password-1`.

Free accounts get 60 hours a month. The codespace keeps its data between
visits, and stopping it costs nothing.

To let someone else see it, open the **Ports** tab, right-click port 3001 →
**Port Visibility** → **Public**, then send them the URL. Make it private again
afterwards, a public port is reachable by anyone with the link.

## On your own machine

**`localhost` means *your* machine.** If someone else ran the app on a server,
`http://localhost:3001` in your browser will not reach it, you have to run it
yourself.

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

## Signing in with Google (optional)

Google sign-in only appears once it is configured. Without it, the button is
not rendered at all, a login button that cannot work is worse than none.

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials),
   create a project, then **Create credentials → OAuth client ID → Web application**.
2. Under **Authorised redirect URIs** add exactly:
   `http://localhost:3001/api/auth/google/callback`
   (add your real domain's version too when you deploy).
3. Put the client ID and secret in `.env.local`:

```bash
GOOGLE_CLIENT_ID="....apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="...."
NEXT_PUBLIC_APP_URL="http://localhost:3001"
LABFLOW_OWNER_EMAIL="you@gmail.com"
```

4. Restart `npm run dev`.

`LABFLOW_OWNER_EMAIL` is the owner account. Every time that address signs in
with Google, its workspace is comped onto the Department plan, so it works
whether the account was made with Google or with a password first. It is an
environment variable rather than a value in the source, because an address
written into the repository is permanent, public in the git history, and a
spam target.

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

Run those with `psql "$DATABASE_URL"`. Read-only never deletes anything -
pages stay readable and only writing is refused.

## If something goes wrong

**`npm run setup` says no Postgres and no Docker**, install Docker Desktop and
run it again, or start Postgres yourself and put its URL in `.env.local` as
`DATABASE_URL`.

**Port 3001 already in use**, `npm run dev -- -p 3002`.

**Nothing loads at localhost:3001**, check the terminal running `npm run dev`
is still going and shows no error. It must stay open.

**Changed `.env.local`**, restart `npm run dev`; environment variables are
read at startup.

**A form does nothing when you submit it, on Codespaces or behind a tunnel** -
Server Actions reject a request whose browser origin differs from the server's
host. `next.config.mjs` already allows `*.app.github.dev` and `*.gitpod.io`; for
any other proxy set `LABFLOW_ALLOWED_ORIGINS="my-tunnel.example.com"` in
`.env.local` and restart.
