# Putting Labvia on the internet

Nothing here depends on GitHub once the site is running. GitHub stores the
source. A host runs it. Those are different jobs, and the site does not need a
Codespace open to stay up.

Labvia needs three things from wherever it runs:

1. A machine that runs a Node server continuously.
2. A PostgreSQL database.
3. A disk that survives a redeploy, for uploaded files.

Anything providing those works. The rest of this page picks one and walks it.

## Do not use Vercel for this

Vercel is the obvious choice for a Next.js app and it is the wrong one here,
for two reasons that will not show up until a customer hits them.

- Its serverless functions cap a request body at about 4.5 MB. Labvia accepts
  25 MB files and 250 MB videos. Every meaningful upload would fail.
- There is no persistent disk. Uploaded files would disappear on the next
  deploy.

Both are fixable, by moving uploads to object storage such as Cloudflare R2 or
Amazon S3. That is a real piece of work and it is not needed yet. Pick a host
with a disk and revisit it when one server stops being enough.

## Render, which has both

Render runs a real server and sells a disk. It has a free database tier to
start on, which expires after 30 days, and a paid one from about $7 a month.

**1. Create the database.** New, PostgreSQL. Copy the **Internal Database URL**
once it is ready.

**2. Create the web service.** New, Web Service, connect the repository, then:

| Setting | Value |
|---|---|
| Root directory | `apps/labflow` |
| Runtime | Docker |
| Dockerfile path | `apps/labflow/Dockerfile` |

**3. Add a disk.** In the service settings, Disks, Add Disk. Mount path
`/data/uploads`, size 10 GB to begin with. Skip this and every uploaded file is
lost at the next deploy, silently.

**4. Set the environment variables.** Under Environment:

```
DATABASE_URL        the Internal Database URL from step 1
NEXT_PUBLIC_APP_URL https://your-service.onrender.com
```

Add the Stripe values from BILLING.md once you have them, and the optional keys
for AI, email and Google sign-in when you want those features. Each feature
says plainly when its own key is missing rather than pretending to work.

**5. Deploy.** Migrations run automatically on boot, so there is no separate
database step. The first boot creates every table.

Railway works the same way: a Postgres plugin, a volume mounted at
`/data/uploads`, and the same variables.

## On your own machine or your own server

```bash
cd apps/labflow
docker compose up -d
```

That starts Labvia and a PostgreSQL beside it, applies migrations, and serves
on port 3001. The database and the uploaded files live in named volumes, so
`docker compose down` and back up loses nothing.

Set `POSTGRES_PASSWORD` and `NEXT_PUBLIC_APP_URL` before anyone but you uses it.

## Point Stripe at the real address

Once the site has a public URL, the Stripe CLI is no longer needed. Use a real
webhook endpoint instead:

**Developers, Webhooks, Add endpoint.**

- URL: `https://your-domain.com/api/stripe/webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`

Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` and redeploy.
It is a different secret from the one `stripe listen` printed.

## Check it before you tell anyone about it

Open `/billing` on the deployed site. If anything about payments is missing it
says so there, and it names the variable rather than making you guess.

Then take one test payment with test keys, following step 6 of BILLING.md, on
the deployed URL rather than localhost. Only after that has worked end to end
should live keys go anywhere near it.

## What still needs doing before real customers

- **Uploads are on one disk.** Fine for one server. It becomes the thing to fix
  when you want two servers, or want backups independent of the host.
- **A custom domain.** Both hosts do this in a few clicks and issue the
  certificate for you. Update `NEXT_PUBLIC_APP_URL` and the Stripe webhook URL
  when you do, or payment redirects will point at the old address.
- **Database backups.** Render and Railway both take them on paid plans.
  Confirm yours is on. A research tool that loses a lab's records has no second
  chance.
