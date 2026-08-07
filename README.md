# Armory v2

Armory v2 is a new Hebrew RTL logistics SaaS foundation built with React, TypeScript, Vite and Cloudflare Pages/D1. It is structurally separate from the legacy frontend.

## Current status

Implemented: project foundation, centralized design system, responsive shell, dashboard fixture, soldiers list/search/filter/expanded details and validated add/edit dialog.

Not yet production-ready: authentication, persisted soldier CRUD, equipment transactions, migration, R2, complete API/E2E coverage and production deployment.

## Development

```bash
npm clean-install
npm run dev
```

Quality:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Local D1 uses the placeholder binding in `wrangler.toml`; replace the remote database ID only after provisioning a dedicated v2 database. Never point v2 migrations at the legacy production database.

See `PLAN.md` and `docs/` for requirements, architecture and migration safety.
