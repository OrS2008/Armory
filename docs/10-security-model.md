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

- The sign-in identifier is a username or an email address, stored lower-cased
  so comparison is case-insensitive. A unit issues names like `Admin.951`, not
  mailboxes.
- Passwords are hashed with PBKDF2-SHA256, a 16-byte random salt per user, and a
  length-independent comparison. The iteration count is stored **per user**, so
  it can be changed later without invalidating existing accounts.
  (Argon2id would be preferable; it needs WASM in a Worker and is not used here.)

  The count defaults to 210,000 and is overridable with the `PBKDF2_ITERATIONS`
  environment variable, with a floor of 10,000. This is not a knob for its own
  sake: the whole login has to fit inside the plan's CPU budget for one request.

  | Iterations | CPU per login |
  | --- | --- |
  | 210,000 | ~130 ms |
  | 100,000 | ~49 ms |
  | 50,000 | ~25 ms |
  | 25,000 | ~13 ms |
  | 10,000 | ~6 ms |

  The Workers **free** plan allows 10 ms of CPU per request and kills anything
  over it, which surfaces as a platform error page rather than an application
  error. On the free plan only ~10,000 iterations fit; the paid plan (30 s) runs
  the default comfortably. Prefer paying over weakening the hash: 10,000
  iterations is well below current guidance.
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

  Because the bootstrap path compares the supplied password against the secret
  before inserting the row, it does not derive the hash a second time to
  "verify" what it just wrote. Doing so doubled the cost of that one request and
  left a window in which the row existed but the login had failed — and since
  any row disables bootstrap permanently, that state locked everyone out.

  Recovery, if it ever happens again: `DELETE FROM users;` in the D1 console
  clears the half-created administrator so the bootstrap can run once more.

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

## Two-factor authentication

TOTP (RFC 6238, HMAC-SHA1, 30-second steps, six digits), which is what every
authenticator app implements. Enrolment stores the secret but leaves the factor
off until a code proves the app actually has it, so a mistyped setup cannot
lock an account out of its own login.

- A password on an enrolled account buys a five-minute, single-purpose
  challenge — no session and no cookie until the code arrives.
- A wrong code does not spend the challenge, so a typo does not send the reader
  back to the password form; the guard against guessing is the login throttle,
  which the code step shares.
- Ten recovery codes are shown once, stored only as hashes, compared in
  constant time, and each is spent on use.
- An administrator can clear a lost factor from the users screen. They cannot
  set one up for somebody else: enrolment requires holding the authenticator.

## Known gaps

Stated plainly rather than implied:

- **MFA is offered, not enforced.** Any account can enrol; nothing requires a
  commander to. Enforcing it needs a way in for someone who has enrolled and
  then lost their phone before the administrator can clear it, and that path is
  the administrator, so a unit that wants it enforced should make it policy and
  audit `mfa_enabled`.
- **No SSO / passkeys.**
- **No session-list or remote-revocation screen**, although the data supports it.
- **No encryption at rest beyond the platform's.** D1 is encrypted by
  Cloudflare; there is no application-level field encryption.
- **No automated dependency scanning** in CI yet (Dependabot or `npm audit`).
- **Rate limiting covers login only**, not the API surface generally. The
  second-factor step shares that throttle, which is what keeps a five-minute
  challenge from being long enough to walk through six digits.

## Before production use

1. Provision a dedicated D1 database and put the real id in `wrangler.toml`.
2. Set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` as Pages secrets,
   log in once, then rotate them.
3. Have the privileged accounts enrol in two-factor authentication from the
   account menu, and keep their recovery codes somewhere that is not the phone
   holding the authenticator.
4. Enable D1 point-in-time recovery and confirm a restore.
5. Review this gap list with whoever owns the unit's security policy.

## The one unauthenticated endpoint

`GET /api/v1/calendar/:token.ics` answers without a session, because a calendar
app cannot sign in. The token in the path is therefore the whole credential,
and the design follows from that:

| Decision | Why |
| --- | --- |
| 24 random bytes, hex | Not guessable, and short enough to paste on a phone |
| Only the SHA-256 is stored | A copy of the `users` table is not a set of working links, exactly as for a session token |
| Read-only, one person | The most a leaked link can do is show when its owner is on duty |
| Issuing a new one retires the old | "I shared it by mistake" and "I lost it" have the same, single answer |
| A malformed or unknown token answers 404, like a revoked one | Nothing distinguishes "never existed" from "no longer valid" |
| `Cache-Control: private, no-store`, `X-Robots-Tag: noindex` | Nothing in front of it keeps a copy, and nothing indexes it |

The screen shows the link once, at the moment it is issued, and says so — the
hash is all we keep, so there is nothing to show a second time.
