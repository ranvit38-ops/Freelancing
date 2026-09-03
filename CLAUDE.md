# CLAUDE.md

Guidance for working in this repository.

## Repository layout

Two independent products live here. They share nothing but a stack.

- **`/` (repo root)** — the re-skinnable business website template. Everything
  below describes *this* product.
- **`apps/labflow/`** — LabFlow, a research workflow SaaS for university labs.
  Separate `package.json`, database, CI job and rules. See
  `apps/labflow/README.md`. The golden rule below does **not** apply there:
  LabFlow is one product with real state, not a template. Its equivalent rule is
  that every database read and write goes through `src/server/queries.ts` scoped
  by workspace.

Root `tsconfig.json`, `.eslintignore` and `.github/workflows/ci.yml` all exclude
`apps/` so the two never interfere.

## What this is

A **re-skinnable** business website template (Next.js 14 App Router + TypeScript
+ Tailwind). One codebase is sold to many clients; each client is a re-skin, not
a fork. See `README.md` (setup) and `RESKIN.md` (per-client checklist).

## The golden rule

**All brand/content/config lives in `site.config.ts`** (repo root), validated by
Zod (`src/lib/site-config.schema.ts`). Components must stay generic — never
hardcode a client's name, copy, colors, routes, or assets in a component. If you
need a new configurable value, add it to the schema + config, then read it.

Theme colors are `"R G B"` channels exposed as CSS variables (`src/lib/theme.ts`)
and consumed via Tailwind tokens (`brand`, `bg`, `fg`, …). Don't introduce raw
hex colors in components.

## Architecture map

- `src/app/` — routes (App Router). API routes under `src/app/api/`.
- `src/components/` — generic, config-driven UI.
- `src/lib/` — `env` (Zod env validation), `stripe`, `resend`, `emails`,
  `rate-limit`, `theme`, `blog`, `nav`, schemas.
- `src/software-adapter/` — typed boundary for a client's external system.
  Default `mock` logs instead of integrating; see its README before adding a
  real vendor (requires the client's API docs).
- `src/content/blog/` — markdown post bodies (metadata lives in config).

## Conventions

- **Honesty over fakery.** If a feature isn't configured (no Stripe price, no
  booking URL, no API docs), render an honest "not configured" state or throw a
  clear error. Never simulate success. Mark manual gaps with `// SETUP REQUIRED:`.
- **Feature flags** (`site.config.ts` → `features`) gate ecommerce / contactForm
  / booking / blog across nav, routes, and sitemap. Respect them in new code.
- **Secrets**: validated in `src/lib/env.ts`; optional per feature via the
  `require*` helpers. Never read secret env vars in client components. `.env*` is
  gitignored — only `.env.example` is tracked.
- **Accessibility**: semantic HTML, labelled controls, visible focus, ARIA where
  needed. Keep it.

## Before committing

Run all four — CI (`.github/workflows/ci.yml`) enforces them:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Unit tests (Vitest) live next to the code as `src/**/*.test.ts` and cover the
pure logic (config schema, contact validation, rate limit, nav filtering, theme
vars). Keep business logic in pure, testable functions where practical.

## Dependencies

Pinned to the latest stable **Next 14.2.x**. Remaining `npm audit` advisories
require a **Next 16 major upgrade** (React 19, breaking changes) — do not bump
without a deliberate migration.

## Installed tooling (session plugins)

- **rtk** (`/usr/local/bin/rtk`) — compresses verbose command output before it
  reaches an agent's context. Prefix noisy commands: `rtk npm run build`,
  `rtk git status`. The global hook is not installed; invoke it explicitly.
- **ponytail** (`.claude/skills/ponytail*`) — skills that push for the simplest
  solution that works. `/ponytail`, `/ponytail-review`, `/ponytail-audit`.
