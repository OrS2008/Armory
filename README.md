# שבצ״ק — SHABATZAK

A Hebrew, right-to-left workforce scheduling system for a company-sized unit:
personnel, availability, qualifications, assignments, conflict detection,
schedule publication and an immutable audit trail.

Built for Cloudflare: a Vite + React SPA on Cloudflare Pages, a REST API in
Pages Functions, and D1 for storage.

> The system is for **administrative personnel scheduling**. It is deliberately
> unable to hold tactical plans, adversary information, routes or target data —
> see [`docs/10-security-model.md`](docs/10-security-model.md).

## Quick start

```bash
npm clean-install
npm run db:migrate:local
npm run db:seed:local     # optional demo data; local only

printf 'BOOTSTRAP_ADMIN_EMAIL=admin@example.test\nBOOTSTRAP_ADMIN_PASSWORD=a-long-local-password\n' > .dev.vars

npm run build && npm run cf:dev   # http://127.0.0.1:8788
```

Sign in with the bootstrap credentials — the first administrator is created on
first login, and only while the user table is empty.

`npm run dev` serves the UI alone on port 4174 with no API. Use `cf:dev` for
anything that talks to the server.

## Deploying to Cloudflare

Cloudflare Pages connected straight to this repository — the same arrangement as
the equipment application. Cloudflare builds and publishes on every push to
`main`; no API token and no deployment workflow are involved. Full walkthrough in
[`docs/12-deployment-plan.md`](docs/12-deployment-plan.md).

One-time setup:

1. `npx wrangler d1 create shabatzak`, and commit the real `database_id` into
   `wrangler.toml`. Pages reads that file and it overrides the dashboard, so the
   placeholder must go.
2. `npx wrangler d1 migrations apply shabatzak --remote`.
3. Dashboard → Workers & Pages → Create → **Pages** → Connect to Git. Build
   command `npm run build`, output directory `dist`, no deploy command.
4. Add a D1 binding named `DB`, plus `BOOTSTRAP_ADMIN_EMAIL` and
   `BOOTSTRAP_ADMIN_PASSWORD` as encrypted variables.
5. `curl https://shabatzak.pages.dev/api/v1/health` — `"status":"ready"` proves
   the database binding works, because that route runs a real query.

Migrations are not run by the Cloudflare build; apply them with `wrangler`
whenever a new one is added.

## Layout

```
src/         React SPA — screens, design system, i18n
shared/      Domain shared by client and server: conflict engine, rules,
             fairness, time, RBAC, Zod schemas, Hebrew domain messages
functions/   Cloudflare Pages Functions — the /api/v1 surface
migrations/  D1 schema
tests/e2e/   Playwright, against a real Pages + D1 server
docs/        Product, architecture, security, testing and deployment
```

The conflict engine lives in `shared/` so the API and the board run the same
code — a warning on screen and a refusal from the server can never disagree.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | UI only, port 4174 |
| `npm run cf:dev` | Full stack: Pages Functions + local D1 |
| `npm run build` | Typecheck and build to `dist/` |
| `npm run typecheck` | `tsc` across app, shared and functions |
| `npm run lint` | ESLint, type-aware, zero warnings |
| `npm run format` / `format:write` | Prettier |
| `npm test` | Vitest — 75 unit and component tests |
| `npm run test:e2e` | Playwright — 11 scenarios, desktop and mobile |
| `npm run db:migrate:local` / `:remote` | Apply D1 migrations |
| `npm run db:seed:local` | Demo data — local only |

## Documentation

| Document | Contents |
| --- | --- |
| [`00-source-plan.md`](docs/00-source-plan.md) | The approved plan and every deviation from it |
| [`01-product-requirements.md`](docs/01-product-requirements.md) | Problem, users, requirements, MVP and what comes next |
| [`02-permissions-matrix.md`](docs/02-permissions-matrix.md) | Roles, permissions, organisational scope |
| [`03-database-schema.md`](docs/03-database-schema.md) | Tables, indexes, the append-only audit trail |
| [`04-api-spec.md`](docs/04-api-spec.md) | Every endpoint, the error taxonomy |
| [`05-frontend-architecture.md`](docs/05-frontend-architecture.md) | State, RTL, accessibility, responsiveness |
| [`06-backend-architecture.md`](docs/06-backend-architecture.md) | Handler shape, transactions, gaps |
| [`07-design-system.md`](docs/07-design-system.md) | Tokens, components, status colour rules |
| [`08-screen-specifications.md`](docs/08-screen-specifications.md) | Every screen and its states |
| [`09-scheduling-engine.md`](docs/09-scheduling-engine.md) | Time model, rules, conflicts, fairness, candidates |
| [`10-security-model.md`](docs/10-security-model.md) | Authentication, authorisation, privacy, known gaps |
| [`11-testing-plan.md`](docs/11-testing-plan.md) | Coverage and what is not tested |
| [`12-deployment-plan.md`](docs/12-deployment-plan.md) | Cloudflare setup, CI/CD, rollback |

## Status

Delivered: the MVP defined in the plan — authentication, RBAC with scope,
personnel, units, qualifications, availability, assignment types and instances
with recurrence, the day/week/personnel board, manual assignment with ranked
candidates, the conflict engine, drafts and atomic publication with versioning,
the personal view, in-app notifications, the immutable audit log, workload
reports, Hebrew RTL and a responsive mobile UI.

Not built, and named rather than implied: MFA, user administration screens,
WebSocket live updates, drag-and-drop scheduling, CSV import, PDF/Excel export,
the command palette, PWA offline caching, and assisted or optimised
auto-scheduling. Each is listed in the document that owns it.
