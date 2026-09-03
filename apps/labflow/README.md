# LabFlow

Turn experiments into a living research record.

LabFlow is a research workflow system for university labs. It connects
**Project → Experiment → Protocol → Samples → Data → Results → Interpretation →
Next steps** into one structured, persistent record, then helps researchers read
that record and communicate it.

It is not a chatbot with a database attached. The workspace is the product; AI
appears only at specific points (analyse an experiment, ask a project), always
citing the records it was given.

---

## Running it

Requires Node 20+ and PostgreSQL 14+ (Supabase connection strings work
unchanged).

```bash
cp .env.example .env.local          # set DATABASE_URL
npm install
npm run db:push                     # apply the schema
npm run db:seed                     # optional: fictional demo lab
npm run dev                         # http://localhost:3001
```

The seed creates a demo workspace you can log into:

```
demo@labflow.test / demo-password-1
```

`npm run db:seed` **truncates** `users` and `workspaces` first. Never run it
against a database holding real records.

### Checks

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

`npm test` runs unit tests everywhere and, when `DATABASE_URL` is set, the
workspace-isolation integration tests against a real database. CI provides one.

---

## Architecture

```
src/
  app/                     routes (App Router)
    (auth)/                login, signup, password reset
    (app)/                 the workspace — everything behind a session
    api/                   file upload/download, PPTX export
  components/              config-free UI; primitives live in ui.tsx
  db/                      Drizzle schema, SQL migrations, demo seed
  lib/                     pure logic — no I/O, all unit tested
  server/
    auth.ts                session cookies (SHA-256 hashed tokens)
    authz.ts               requireSession — the single entry point
    not-found.ts           NotFoundInWorkspaceError
    queries.ts             the ONLY place that touches the database
    storage.ts             file storage adapter (local disk today)
    actions/               server actions, one file per area
    ai/                    retrieval → prompt → validated output
```

**The rule that matters:** every function in `server/queries.ts` takes a
`SessionContext` and filters on `session.workspaceId`. There is no "load by id"
that skips that predicate. A guessed UUID from another lab returns nothing, and
`src/server/queries.integration.test.ts` proves it against a real database —
cross-workspace reads, writes, listings, search and comparison are all covered.

Pure logic lives in `src/lib/` so it can be tested without a database:
completeness checking, comparison diffs, research memory, CSV description,
chart geometry, and the research-update draft.

---

## What the AI does and does not do

- It is given a **bounded, plain-text rendering** of specific retrieved records
  (`server/ai/context.ts`) — never database access, never raw data rows. Only
  descriptive column statistics are sent.
- Output is **schema-validated** before it is shown. A malformed response is an
  error, not a rendered guess.
- Every response is stored in `ai_generations` with the evidence it was given.
- Observations, inferences and suggestions are **labelled separately** in the UI.
- AI output is **never written into the scientific record** automatically.
- Without `ANTHROPIC_API_KEY`, AI features say they are not configured. They
  never fabricate a result to fill the gap.

**Research memory is deliberately not AI.** It is derived from the structured
record, so every line traces to an experiment someone actually wrote.

---

## Security

- Passwords: scrypt (Node crypto), per-password salt, constant-time compare.
- Sessions: 32 bytes of entropy; only the SHA-256 hash is stored; httpOnly,
  SameSite=Lax, Secure in production.
- Login costs the same for unknown emails, so the form cannot enumerate accounts.
- Authorisation is server-side in the data layer, never in the browser.
- Files are served through `/api/files/[id]` with a membership check and
  `Content-Disposition: attachment` — never from a public bucket URL.
- Uploads are extension-allowlisted and capped at 25 MB. Storage keys are
  generated, never taken from the filename, and path traversal is rejected.
- Research data is never used to train models.

**Next step for defence in depth:** Postgres row-level security. The data layer
is already the single choke point, so adding RLS is additive, not a rewrite.

---

## What is not built yet

Stated plainly rather than stubbed with buttons that do nothing:

- **.xlsx parsing.** Excel uploads are stored and attached to the experiment,
  but not parsed into a dataset. The UI says so. CSV/TSV are parsed.
- **Email delivery.** Password-reset links are written to the server log, and
  member invitations are unavailable. Both need a mail provider.
- **Charts in exported decks.** The PPTX carries text and attribution; plots
  live in the app.
- **Multi-workspace switching.** A user in several workspaces lands in their
  earliest one.
- **Full-text search.** Search is `ILIKE` across the record — fast and honest at
  lab scale. A `tsvector` column is the upgrade when a lab has thousands of runs.

---

## Extending it

The seams are already in place: `server/storage.ts` for S3/Supabase Storage,
`server/ai/context.ts` for richer retrieval, `db/migrations/` for schema
changes. Integrations (Drive, OneDrive, ELNs, instruments) are deliberately
absent until there is a real client and real API docs.
