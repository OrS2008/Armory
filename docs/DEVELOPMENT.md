# Development

Node and npm versions should be pinned in CI before the first release. Install with `npm clean-install`, run Vite with `npm run dev`, and execute typecheck/lint/unit/build before committing.

The current UI uses deterministic development fixtures. They contain invented non-production records and are not uploaded. Persisted APIs are planned and must use a disposable local D1 during development.
