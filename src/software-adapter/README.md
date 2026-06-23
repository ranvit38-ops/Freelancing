# Software Adapter

This directory is the **typed boundary** between the website and a client's
external software (CRM, scheduler, inventory, ERP, custom app).

## Why it exists (the honest version)

There is **no universal API** for "their software." Every client's system is
different, and many have **no public, documented API at all**. That means a
real integration **cannot be fully templated** — it is per-client custom work.

What we *can* template is a stable contract, `SoftwareAdapter` (`types.ts`), so
the rest of the app never depends on any specific vendor. The default
`MockAdapter` keeps the site fully runnable and **honestly logs** what it would
have sent instead of pretending a real system received it.

## Files

| File         | Purpose                                                            |
| ------------ | ----------------------------------------------------------------- |
| `types.ts`   | The `SoftwareAdapter` interface + data types. The stable contract.|
| `mock.ts`    | Default no-integration implementation. Logs, never fakes success. |
| `index.ts`   | Factory that selects the adapter via `SOFTWARE_ADAPTER` env var.   |

## Adding a real integration

> ⚠️ **SETUP REQUIRED — per client, not templatable without docs.**

1. Obtain the client's **API documentation** and **credentials**.
2. Create `./<vendor>.ts` implementing `SoftwareAdapter`:

   ```ts
   import type { SoftwareAdapter, Lead, LeadResult } from "./types";

   export class HubspotAdapter implements SoftwareAdapter {
     readonly name = "hubspot";
     async createLead(lead: Lead): Promise<LeadResult> {
       // real API call using process.env.HUBSPOT_TOKEN ...
       return { delivered: true, externalId: "...", adapter: this.name };
     }
     // recordOrder, healthCheck ...
   }
   ```

3. Register it in `index.ts` (`case "hubspot": ...`).
4. Set `SOFTWARE_ADAPTER=hubspot` and the vendor credentials in `.env`.

If a client has **no API/docs**, say so plainly: this part is custom
engineering, billed separately, and stays on `mock` until access is provided.
