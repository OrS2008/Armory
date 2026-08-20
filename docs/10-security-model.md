# Security model

## Domain safety boundary

The application manages **who is administratively assigned, and when**. It has
no place to record adversary information, target selection, weapons employment,
patrol routes, force positioning or engagement planning, and no such field
should be added. Qualifications are generic authorisation tags; assignment
instructions are free text intended for administrative notes.

Data minimisation is a schema decision, not a policy statement: personnel rows
hold a display name, an optional service number, unit, role title, phone and
notes. There is no medical detail, no address, no national id.

## Authentication

- Passwords are hashed with PBKDF2-SHA256, 210,000 iterations, a 16-byte random
  salt per user, verified with a length-independent comparison. The iteration
  count is stored per user so it can be raised without invalidating accounts.
  (Argon2id would be preferable; it needs WASM in a Worker and is not used here.)
- Sessions are 32 random bytes. Only the SHA-256 hash is stored, so a database
  read does not yield usable tokens.
- The cookie is `HttpOnly; Secure; SameSite=Strict; Path=/`, with a 12-hour
  default TTL configurable through `SESSION_TTL_HOURS`.
- Sessions can be revoked (`revoked_at`) and carry `last_seen_at` and a client
  label for a future device list.
- Failed logins are recorded; eight failures for one address within 15 minutes
  return `429 RATE_LIMITED`. Both success and failure are audited.
- First-run bootstrap: the initial administrator is created from
  `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, and **only while the
  user table is empty**. Rotate the secret after first login.

## Authorisation

Every handler names the permission it needs; see `docs/02-permissions-matrix.md`.
Authorisation is server-side without exception. Organisational scope is checked
on both the current and the target unit for writes, so a scoped scheduler cannot
move a person out of their scope.

## Web hardening

- `public/_headers` sets a CSP with `default-src 'self'`, no inline script, no
  external origins, `frame-ancestors 'none'`, `base-uri 'none'`,
  `object-src 'none'`, plus `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy` and HSTS.
- CSRF: `SameSite=Strict` cookies, a JSON content-type requirement on mutations,
  and an explicit same-origin check on every non-GET request.
- XSS: React escapes by default and the app never uses
  `dangerouslySetInnerHTML`. The CSP is the second layer.
- SQL injection: every statement is a prepared statement with bound parameters.
  No string interpolation reaches SQL except fixed `?` placeholder lists whose
  length is derived from array length.
- Input validation: Zod on both sides, plus `CHECK` constraints in the database.
- API responses are `Cache-Control: no-store`.

## Audit

`audit_events` is append-only at the database level (see
`docs/03-database-schema.md`). Metadata is deliberately small — identifiers,
changed field names, before/after values for times and counts — and never
free-text notes or personal details. Logged actions include login, failed login,
logout, personnel and unit changes, availability decisions, assignment
creation/modification/cancellation, assignment and removal of people, overrides
(as their own event, with the rule codes), publication, rule changes and
replacement decisions.

## Privacy

- A soldier sees only their own schedule and availability.
- Draft assignments are invisible to soldiers until the schedule is published.
- Notifications carry the minimum needed to open the app: what changed, when,
  and how many items — never another person's details.
- Application logs contain no scheduling data; the single client-side log is the
  error boundary's message and component stack.

## Known gaps

Stated plainly rather than implied:

- **No MFA.** The plan asks for MFA on privileged accounts. Not built.
- **No SSO / passkeys.**
- **No user administration UI.** Accounts after the bootstrap admin must be
  created directly in D1.
- **No session-list or remote-revocation screen**, although the data supports it.
- **No encryption at rest beyond the platform's.** D1 is encrypted by
  Cloudflare; there is no application-level field encryption.
- **No automated dependency scanning** in CI yet (Dependabot or `npm audit`).
- **Rate limiting covers login only**, not the API surface generally.

## Before production use

1. Provision a dedicated D1 database and put the real id in `wrangler.toml`.
2. Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` as Pages secrets,
   log in once, then rotate them.
3. Restrict access at the edge (Cloudflare Access or equivalent) if the unit
   requires more than password authentication — that is the practical answer to
   the missing MFA until it is built.
4. Enable D1 point-in-time recovery and confirm a restore.
5. Review this gap list with whoever owns the unit's security policy.
