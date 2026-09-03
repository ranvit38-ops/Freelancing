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

**Research memory and the "needs attention" list are deliberately not AI.** Both
are derived from the structured record, so every line traces to an experiment
someone actually wrote, and both work with no API key at all.

The AI chatbot is deliberately *not* the front door. It appears at specific
points — analyse an experiment, ask a project — because a workspace that
understands your records is the product; a chat box on top of a database is not.

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

- **Legacy `.xls`** (pre-2007 binary) is stored but not parsed. `.xlsx` and
  CSV/TSV are parsed into datasets.
- **Member invitations.** Email delivery works, but the invite flow itself is
  not built; a workspace owner cannot yet add someone by address.
- **Live-key AI.** The AI path is covered end to end against a stubbed
  transport — retrieval, prompt, JSON extraction, schema validation, evidence
  filtering, persistence and workspace refusal. The network call itself is the
  only uncovered line.
- **Full-text search.** Search is `ILIKE` across the record — fast and honest at
  lab scale. A `tsvector` column is the upgrade when a lab has thousands of runs.
- **External integrations** (Drive, OneDrive, Notion, ELNs, instruments).
  Deliberately absent until there is a real client and real API docs.

## How things connect

The point of LabFlow is that nothing is an island:

- **Files** (`/files`) lists every upload beside the experiment that produced it
  and the project it belongs to — the thing a shared drive cannot tell you. A
  parsed CSV or spreadsheet links straight to its dataset and chart.
- **Protocols** show which experiments used each version, so "what changed
  between v3 and v4" has an answer and a list of affected runs.
- **Samples** link back to every experiment that consumed them.
- **Needs attention** (`/actions`) derives concrete next steps from the record —
  a finished run with no conclusion, a run left in progress for a fortnight, a
  protocol nothing references. It is mechanical, not AI, so it is always
  available and always explainable, and it only ever comments on the
  *documentation*, never on the science.

## Extending it

The seams are already in place: `server/storage.ts` for S3/Supabase Storage,
`server/ai/context.ts` for richer retrieval, `db/migrations/` for schema
changes. Integrations (Drive, OneDrive, ELNs, instruments) are deliberately
absent until there is a real client and real API docs.
