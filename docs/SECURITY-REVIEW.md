# Security review — foundation

## Implemented and verified

- Strict TypeScript, Zod form validation and escaped React rendering.
- CSP/security headers for the Pages output.
- D1 schema uses constraints, foreign keys and intended parameterized access.
- No sensitive data is stored in browser persistence or service-worker caches; no service worker is currently enabled.
- V2 database binding uses a non-routable placeholder to avoid accidental legacy/production mutation.

## Open decisions

- Authentication/session model and CSRF protection.
- Object-level authorization and normalized permission rules.
- Legacy encryption compatibility and migration re-encryption method.
- R2 object authorization, retention and deletion.
- Production logging/redaction and monitoring.

## Dependency finding

`npm audit --omit=dev` reports two high advisories through React Router 7.18.2. The reported RSC/server-action CSRF path is not used by this client-only Vite SPA, but the advisory remains present and is not marked resolved. Track upstream releases and replace/update before production acceptance. Development-tool advisories are separately reported by npm and also remain open.

No production-readiness claim is made while authentication and authorization are unimplemented.
