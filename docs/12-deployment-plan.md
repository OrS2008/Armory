# Deployment plan

Target: Cloudflare Pages (static bundle + Functions) with a D1 database.

```
Browser ──▶ Cloudflare Pages
              ├── dist/            static SPA
              └── functions/       /api/v1/*  ──▶  D1 (binding: DB)
```

## One-time setup

You need a Cloudflare account with Pages and D1 enabled, and `wrangler` (already
a dev dependency — `npx wrangler …`).

### 1. Create the database

```bash
npx wrangler d1 create shabatzak
```

Copy the returned `database_id` into `wrangler.toml`, replacing the
all-zeros placeholder. This is deliberate: the placeholder makes an accidental
deploy against someone else's database impossible.

### 2. Apply migrations

```bash
npx wrangler d1 migrations apply shabatzak --remote
```

### 3. Create the Pages project

```bash
npm run build
npx wrangler pages project create shabatzak --production-branch=main
npx wrangler pages deploy dist --project-name=shabatzak
```

### 4. Bind the database

In the Cloudflare dashboard: **Workers & Pages → shabatzak → Settings →
Functions → D1 database bindings**, add binding name `DB` → database `shabatzak`,
for both Production and Preview.

### 5. Set the bootstrap secrets

**Settings → Environment variables → Add (encrypted)**:

| Name | Value |
| --- | --- |
| `BOOTSTRAP_ADMIN_EMAIL` | The first administrator's address |
| `BOOTSTRAP_ADMIN_PASSWORD` | A long random password |
| `SESSION_TTL_HOURS` | Optional; defaults to 12 |

Log in once to create the administrator, then rotate both values — the bootstrap
path only runs while the user table is empty, so they are useless afterwards and
should not linger.

## Continuous deployment

`.github/workflows/deploy.yml` builds, runs the quality gate, applies migrations
and deploys. It runs on pushes to `main` and on manual dispatch.

Add two repository secrets under **Settings → Secrets and variables → Actions**:

| Secret | Where it comes from |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token. Permissions: *Account · Cloudflare Pages · Edit* and *Account · D1 · Edit* |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard sidebar, or `npx wrangler whoami` |

The alternative is Cloudflare's own Git integration (Pages → Connect to Git),
with build command `npm run build` and output directory `dist`. Use one or the
other, not both.

`.github/workflows/ci.yml` runs typecheck, lint, formatting, unit tests, the
build and the Playwright suite on every branch and pull request. It needs no
secrets.

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
