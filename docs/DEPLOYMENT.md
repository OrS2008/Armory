# Deployment

Vite builds to `dist`; Cloudflare Pages serves `dist` and the `functions` directory. The D1 binding is `DB`.

The checked-in UUID is a placeholder and prevents accidental production coupling. Provision a dedicated `armory-v2` database, update the Cloudflare project binding, apply migrations to preview, run API smoke tests and only then configure GitHub automatic deployments.

Production deployment and smoke tests are not yet performed or authorized.
