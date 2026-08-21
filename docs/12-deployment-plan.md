# Deployment plan

Target: Cloudflare Pages (static bundle + Functions) with a D1 database.

```
Browser ──▶ Cloudflare Pages
              ├── dist/            static SPA
              └── functions/       /api/v1/*  ──▶  D1 (binding: DB)
```

## Setup — the short path

Everything is automated. You add four repository secrets, then run one workflow.

### 1. Create a Cloudflare API token

Cloudflare → My Profile → API Tokens → **Create Token** → *Create Custom Token*.
Give it the least privilege that works:

| Permission | Level |
| --- | --- |
| Account · Cloudflare Pages | Edit |
| Account · D1 | Edit |

Scope *Account Resources* to the one account. Do not use the Global API Key.

### 2. Add four repository secrets

GitHub → Settings → Secrets and variables → **Actions** → *New repository secret*:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | The token from step 1 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard sidebar, or `npx wrangler whoami` |
| `BOOTSTRAP_ADMIN_EMAIL` | The first administrator's address |
| `BOOTSTRAP_ADMIN_PASSWORD` | A long random password |

### 3. Run the provisioning workflow

GitHub → **Actions** → *Provision Cloudflare* → **Run workflow**.

It creates the D1 database, creates the Pages project, applies migrations, sets
the bootstrap secrets on the project, builds, deploys, and then probes
`/api/v1/health` until the site answers `"status":"ready"` — which only happens
if the D1 binding is really wired up. The run summary prints the database id and
the site URL.

Every step is safe to re-run: existing resources are detected and reused.

### 4. Sign in, then rotate

Open `https://<project>.pages.dev/login` and sign in with the bootstrap
credentials. The first administrator is created only while the user table is
empty, so afterwards those values are useless — rotate them anyway, in both the
GitHub secrets and the Pages project.

## After setup

Pushes to `main` run `Deploy to Cloudflare Pages`, which repeats the quality
gate, resolves the database id, applies any new migrations, deploys and
smoke-tests the result.

## The placeholder database id

`wrangler.toml` keeps `00000000-0000-0000-0000-000000000000` on purpose, so a
stray `wrangler` command cannot touch a real database. Both workflows resolve the
real id from the account at run time and substitute it for that run only. Nothing
secret, and nothing environment-specific, is committed.

## Doing it by hand instead

```bash
npx wrangler d1 create shabatzak          # note the database_id
npx wrangler d1 migrations apply shabatzak --remote
npm run build
npx wrangler pages project create shabatzak --production-branch=main
npx wrangler pages deploy dist --project-name=shabatzak
```

Then bind D1 as `DB` under Workers & Pages → shabatzak → Settings → Bindings, and
add `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` as encrypted
environment variables. `SESSION_TTL_HOURS` is optional and defaults to 12.

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
