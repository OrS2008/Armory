/**
 * Turns an account into SQL, without the password ever being here.
 *
 * The screen is the way to add a user and this is not a replacement for it.
 * It exists because the screen was failing and somebody still had to be able
 * to sign in — and because the alternative, when that happens, is typing an
 * INSERT by hand against production, which is how a password ends up stored
 * in a form nothing can verify.
 *
 * PBKDF2-SHA256 over the salt's own characters, 256 bits, hex — the same shape
 * `hashPassword` derives, so what is written here is indistinguishable from
 * what the app writes. The derivation happens wherever this is run; only the
 * salt and the hash travel, so the password is not recorded in a workflow's
 * inputs, where it would outlive the person changing it.
 *
 * The iteration count is stored on the row, and login uses the row's rather
 * than today's configured value, so an account written here keeps working when
 * the deployment's cost is raised later.
 *
 *   USER_NAME=max DISPLAY_NAME=מקסים ROLE=unit_scheduler \
 *   SALT=... HASH=... ITERATIONS=10000 node scripts/user-sql.mjs
 */
const ROLES = ['system_admin', 'company_commander', 'unit_scheduler', 'soldier', 'viewer'];

const login = (process.env.USER_NAME ?? '').trim().toLowerCase();
const displayName = (process.env.DISPLAY_NAME ?? '').trim();
const role = (process.env.ROLE ?? '').trim();
const salt = (process.env.SALT ?? '').trim();
const hash = (process.env.HASH ?? '').trim();
const iterations = Number(process.env.ITERATIONS ?? 0);
const personName = (process.env.PERSON ?? '').trim();

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

// The same identifier the sign-in form accepts: a unit issues names like
// Admin.951, so a username is as valid as an email address.
if (!/^[A-Za-z0-9._-]{3,64}$/.test(login) && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login)) {
  fail('USER_NAME must be 3-64 of A-Z a-z 0-9 . _ - , or an email address.');
}
if (displayName.length < 2) fail('DISPLAY_NAME is required.');
if (!ROLES.includes(role)) fail(`ROLE must be one of: ${ROLES.join(', ')}`);
// Checked rather than assumed: a hash of the wrong length is an account that
// cannot log in, and the only symptom is a password that "does not work".
if (!/^[0-9a-f]{32}$/.test(salt)) fail('SALT must be 32 hex characters.');
if (!/^[0-9a-f]{64}$/.test(hash)) fail('HASH must be 64 hex characters.');
if (!Number.isInteger(iterations) || iterations < 10_000) {
  fail('ITERATIONS must be a whole number, at least 10000.');
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const id = `usr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const person = personName
  ? `(SELECT id FROM personnel WHERE display_name = ${q(personName)} AND status = 'active' LIMIT 1)`
  : 'NULL';

// WHERE NOT EXISTS rather than OR IGNORE: the account is keyed by a generated
// id, so OR IGNORE would happily write a second row for a name already taken.
console.log(
  `INSERT INTO users (id, email, display_name, password_hash, password_salt, password_iterations,
                    role, personnel_id, mfa_enabled, active, created_at, updated_at)
SELECT ${q(id)}, ${q(login)}, ${q(displayName)}, ${q(hash)}, ${q(salt)}, ${iterations},
       ${q(role)}, ${person}, 0, 1, ${Date.now()}, ${Date.now()}
 WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ${q(login)});`,
);
