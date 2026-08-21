# Deployment plan

Target: Cloudflare Pages (static bundle + Functions) with a D1 database.

```
Browser ──▶ Cloudflare Pages
              ├── dist/            static SPA
              └── functions/       /api/v1/*  ──▶  D1 (binding: DB)
```

## How this is deployed

Cloudflare Pages, connected directly to the GitHub repository — the same
arrangement as the equipment application (`armory-v2`). Cloudflare clones the
repo on every push to `main`, runs the build itself and publishes the result.
There is no deployment workflow in GitHub Actions, and no Cloudflare API token
anywhere.

`.github/workflows/ci.yml` still runs typecheck, lint, formatting, unit tests,
the build and the Playwright suite on every branch and pull request. It never
touches Cloudflare.

## One-time setup

### 1. Create the D1 database

Already done — `wrangler.toml` carries the real id:

```toml
[[d1_databases]]
binding = "DB"
database_name = "shabatzak"
database_id = "cdd2fb8a-d82e-4b50-bf1d-02a5f103aef6"
```

For a fresh environment: `npx wrangler d1 create <name>`, then put the printed
`database_id` here.

This is not optional and not cosmetic. Cloudflare Pages reads `wrangler.toml`
from the repository and it **takes precedence over the bindings configured in
the dashboard** — no dashboard binding can compensate for a wrong id here. A
placeholder produced exactly this on the first deploy:

```
Error 8000022: Invalid database UUID (00000000-0000-0000-0000-000000000000)
```

The id is an identifier, not a credential: it is useless without an account API
token, which is why the equipment application also keeps its own in the repo.

### 2. Apply the migrations

Cloudflare's build never runs migrations, so this is a separate, deliberate step
every time one is added. `wrangler` applies only the migrations the database has
not seen yet.

From a machine with a terminal:

```bash
npx wrangler d1 migrations apply shabatzak --remote
```

Or, with no terminal to hand: GitHub → **Actions** → **Apply D1 migrations** →
*Run workflow*. It lists what is pending, applies it, and then polls
`/api/v1/health` until the live site reports `"schema":"ready"` — so a green run
means the deployed site can serve requests, not merely that a command exited
zero. Tick **dry run** to see the pending list without applying anything.

That workflow needs `CLOUDFLARE_API_TOKEN` (Account · D1 · Edit is enough) and
`CLOUDFLARE_ACCOUNT_ID` as repository secrets. It is the only workflow that
talks to Cloudflare; deployment remains Cloudflare's own Git integration.

### 3. Create the Pages project

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git**. Choose this repository, then:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |

Do not set a deploy command. Pages publishes the output directory itself;
`wrangler deploy` is the Workers command and will fail here with
*"Missing entry-point to Worker script"*.

If the dashboard offers to import the repository as a **Worker**, decline and
take the Pages path. A Worker expects a script entry point and static assets
declared in `wrangler.toml`; this application is Pages Functions plus a static
bundle.

### 4. Bind the database and set the secrets

**Settings → Bindings** — add a D1 binding named `DB` pointing at the
`shabatzak` database, for both Production and Preview.

**Settings → Variables and Secrets** — add, encrypted:

| Name | Value |
| --- | --- |
| `BOOTSTRAP_ADMIN_EMAIL` | The first administrator's address |
| `BOOTSTRAP_ADMIN_PASSWORD` | A long random password, at least 12 characters |
| `SESSION_TTL_HOURS` | Optional; defaults to 12 |

The password minimum is enforced by the login form; a shorter one locks you out.

### 5. Deploy, verify, then rotate

Push to `main`, or use **Retry deployment**. When it finishes:

```bash
curl https://shabatzak.pages.dev/api/v1/health
```

The response separates the two things that fail separately:

```json
{ "status": "ready", "database": "ready", "schema": "ready" }
```

| Reading | Meaning | Fix |
| --- | --- | --- |
| `database: "unreachable"` | No working D1 binding | The `database_id` in `wrangler.toml`, or the binding itself |
| `schema: "missing"` | Bound, but the migrations were never applied | `npx wrangler d1 migrations apply shabatzak --remote` |
| `bootstrap: "not_configured"` | No accounts, and no bootstrap secrets on this deployment | Add them, then **Retry deployment** |
| `bootstrap: "pending"` | No accounts, secrets present — the first sign-in will create the administrator | If sign-in still fails, the stored values differ from what is typed |
| `bootstrap: "complete"` | An account exists, so the bootstrap no longer runs | A failed sign-in now means a genuinely wrong password |
| `status: "ready"` | Binding and schema both fine | — |

`bootstrap` exposes no value and no identifier, only which of three states the
deployment is in. Without it, "nobody has signed in yet" and "an account exists
whose password does not match" are indistinguishable from the login screen, and
they have opposite remedies.

A correctly bound but empty database answers `SELECT 1` happily, which is why the
schema is probed separately rather than inferred.

Then sign in at `/login` with the bootstrap credentials. The first administrator
is created only while the user table is empty, so afterwards those values are
useless — rotate them anyway.

## Local development

```bash
npm clean-install
npm run db:migrate:local        # apply migrations to local D1
npm run db:seed:local           # optional demo data — never run against production
printf 'BOOTSTRAP_ADMIN_EMAIL=admin@example.test\nBOOTSTRAP_ADMIN_PASSWORD=a-long-local-password\n' > .dev.vars
npm run build && npm run cf:dev # http://127.0.0.1:8788 — full stack
```

`npm run dev` serves the UI alone on port 4174 with no API; use `cf:dev` when
working on anything that talks to the server.

## Rollback

Pages keeps every deployment: **Deployments → … → Rollback**. Migrations are
forward-only — a schema change that must be undone needs a new migration.

## Operations

- `GET /api/v1/health` returns `{ status: "ready" }` after a database round
  trip; point an uptime check at it.
- Schedule publication is a single `env.DB.batch`, so a failure leaves the
  previously published schedule intact.
- Enable D1 Time Travel / point-in-time recovery and rehearse a restore before
  real data is entered.
- Cloudflare's dashboard provides request, error and latency metrics; there is
  no external error tracker wired up yet.
