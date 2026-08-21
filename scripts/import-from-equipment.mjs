/**
 * Turn a roster exported from the equipment system into SHABATZAK personnel.
 *
 * Reads the JSON that `wrangler d1 execute --json` prints on stdin and writes
 * SQL on stdout. It only ever produces INSERT statements against the SHABATZAK
 * database — the equipment database is read with a SELECT and never written to.
 *
 * Only what scheduling needs crosses over: name, service number, unit, phone,
 * and whether the soldier holds a current military driving licence. Equipment
 * holdings, documents, shortage reports and signatures stay where they are.
 */
import { readFileSync } from 'node:fs';

const ORG = 'org_default';
const DRIVER_QUALIFICATION = 'qlf_driver';

const args = new Map(
  process.argv.slice(2).map((entry) => {
    const [key, ...rest] = entry.replace(/^--/, '').split('=');
    return [key, rest.join('=') || 'true'];
  }),
);

const raw = readFileSync(args.get('input') ?? 0, 'utf8');
const parsed = JSON.parse(raw);

/** wrangler wraps results differently across versions; accept every shape. */
function extractRows(payload) {
  if (Array.isArray(payload) && payload.length > 0 && Array.isArray(payload[0]?.results)) {
    return payload.flatMap((entry) => entry.results ?? []);
  }
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload)) return payload;
  return [];
}

const rows = extractRows(parsed);
const quote = (value) =>
  value === null || value === undefined || value === ''
    ? 'NULL'
    : `'${String(value).replace(/'/g, "''")}'`;

// Deterministic ids from the source row, so re-running the import updates
// nothing and duplicates nothing.
const idFor = (prefix, seed) => {
  let hash = 0x811c9dc5;
  for (const char of `${prefix}:${seed}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${prefix}_eq${hash.toString(16).padStart(8, '0')}${seed.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
};

const units = new Map();
const lines = [];
let people = 0;
let drivers = 0;

for (const row of rows) {
  const name = (row.full_name ?? '').trim();
  const externalId = (row.personal_id ?? '').trim();
  if (!name || !externalId) continue;

  const unitName = (row.department_name ?? '').trim();
  let unitId = 'NULL';
  if (unitName) {
    if (!units.has(unitName)) {
      const id = idFor('unt', unitName);
      units.set(unitName, id);
      lines.push(
        `INSERT OR IGNORE INTO units (id, org_id, parent_id, name, kind, sort_order, active, created_at, updated_at) ` +
          `VALUES ('${id}', '${ORG}', NULL, ${quote(unitName)}, 'team', 0, 1, 0, 0);`,
      );
    }
    unitId = `'${units.get(unitName)}'`;
  }

  const personId = idFor('per', externalId);
  const phone = args.get('phones') === 'false' ? null : (row.phone ?? null);
  lines.push(
    `INSERT OR IGNORE INTO personnel (id, org_id, unit_id, external_id, display_name, role_title, phone, status, notes, created_at, updated_at) ` +
      `VALUES ('${personId}', '${ORG}', ${unitId}, ${quote(externalId)}, ${quote(name)}, NULL, ${quote(phone)}, 'active', NULL, 0, 0);`,
  );
  people += 1;

  if (args.get('drivers') !== 'false' && Number(row.has_military_licence) === 1) {
    lines.push(
      `INSERT OR IGNORE INTO personnel_qualifications (personnel_id, qualification_id, granted_at) ` +
        `VALUES ('${personId}', '${DRIVER_QUALIFICATION}', 0);`,
    );
    drivers += 1;
  }
}

process.stderr.write(
  `people: ${people}\nunits: ${units.size}\ndrivers (military licence): ${drivers}\n`,
);
process.stdout.write(`${lines.join('\n')}\n`);
