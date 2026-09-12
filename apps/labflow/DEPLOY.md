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

Render runs a real server and sells a disk. Its database is the one part worth
buying elsewhere, for the reason in step 1.

**1. Create the database, on Neon rather than Render.** Render's free Postgres
expires 30 days after creation, and after a 14 day grace period Render deletes
it and everything in it. It also takes no backups. That is a bad place to put a
lab's first month of records.

[Neon](https://neon.com) gives 0.5 GB free with no expiry and no card. Create a
project and copy the connection string, which looks like
`postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require`.

Render's own PostgreSQL is the right answer later, at about $6 a month, once
the data matters enough to want backups on the same platform.

**2. Create the web service.** New, Web Service, connect the repository, then:

| Setting | Value |
|---|---|
| Root directory | `apps/labflow` |
| Runtime | Docker |
| Dockerfile path | `apps/labflow/Dockerfile` |

**3. Add a disk.** In the service settings, Disks, Add Disk. Mount path
`/data/uploads`, size 10 GB to begin with. Skip this and every uploaded file is
lost at the next deploy, silently.

A mounted disk carries its ownership from the host, not from the image, and
Labvia runs as a non-root user so that a bug in a file handler is not a bug
with root's privileges. If the host mounts that disk for root, the server
cannot write to it. It refuses to start rather than serving a site whose
uploads fail the first time a researcher tries one, and the deploy log says
which path it could not write to. The fix is to give that disk to uid 1001, or
to mount it somewhere writable and point `UPLOAD_DIR` at that path instead.

**4. Set the environment variables.** Under Environment:

```
DATABASE_URL        the Neon connection string from step 1
NEXT_PUBLIC_APP_URL https://your-service.onrender.com
```

Add the Stripe values from BILLING.md once you have them, and the optional keys
for AI, email and Google sign-in when you want those features. Each feature
says plainly when its own key is missing rather than pretending to work.

If you use Google sign-in, go back to your OAuth client at
[console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
and add the deployed callback as a second authorised redirect URI:

```
https://your-service.onrender.com/api/auth/google/callback
```

Google matches that string exactly, so the localhost one you added while
developing does nothing for the deployed site. Set `NEXT_PUBLIC_APP_URL` to the
same origin: every sign-in redirect is built from it, and a wrong value sends
people to an address that does not resolve.

**5. Deploy.** Migrations run automatically on boot, so there is no separate
database step. The first boot creates every table.

**Do not use Render's free web service while a lab is testing.** It spins down
after 15 minutes of inactivity, and the next visitor waits 30 to 60 seconds
staring at nothing. A researcher who opens your link once, waits a minute, and
closes the tab is a researcher you do not get a second chance with. The $7 tier
removes it.

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

## Running it as a free pilot

Set `LABFLOW_PILOT_MODE` to `1` and the deployment stops being a product for
sale and becomes a pilot. Every workspace gets the Department plan, free, with
no expiry. Nobody is stopped at a seat cap, no trial counts down halfway
through the month you asked them to evaluate, and no page asks anyone to pay.

The billing page becomes four questions instead: would your lab pay for this,
what would it be worth per month, what would stop you, and who decides. Those
answers land on the owner dashboard beside how much each lab actually used the
product, which is the only way to read them. "We would pay sixty dollars" from
a lab that logged in twice is not the same sentence as the same words from a
lab that ran forty experiments.

It is the same code as the paid product, one flag apart, so what a lab tests
is what they would buy. Nothing about the pilot is a mock-up.

Two things to know:

- Unlike `LABFLOW_DISABLE_PAYWALL`, this works in production, because a pilot
  is a production deployment. It is the one setting that can give the product
  away by accident, so the owner dashboard states loudly when it is on.
- Removing the variable ends the pilot at the next deploy. Workspaces fall back
  to whatever they are actually entitled to, which for a pilot lab is the free
  plan. Nothing is deleted, and everything stays readable.

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
- **Database backups.** Neon's free plan keeps a short restore window; its paid
  plans and Render's both keep real backups. Confirm yours before a lab trusts
  the tool with a month of work. A research tool that loses a lab's records has
  no second chance.
