/**
 * Turns a crew roster into SQL, so the roster never has to live in the repo.
 *
 * Who is in which crew is personnel data: it changes when somebody moves, and
 * it has no business in a file under version control. The shape of a crew — a
 * post, a name, an order, a seat per member — is structure, and that is what
 * this file knows. The people arrive at run time in CREWS_JSON, are matched by
 * the name the roster already holds, and are never written down here.
 *
 *   CREWS_JSON='{"post":"חפ\"ק","crews":[
 *     {"name":"סבב א׳","members":[{"person":"...","seat":"CMD"}]}
 *   ]}' node scripts/crew-sql.mjs
 *
 * `seat` is a qualification code. The mark is granted to the member as well as
 * recorded on their seat: a named seat belongs to its mark, so a crew member
 * who does not hold it would be refused the seat their own crew gives them.
 *
 * A member may carry `"create": true`, which enrols them if the roster has
 * nobody active under that name. It has to be asked for per member and never
 * inferred, because the ordinary reason a name does not match is that it was
 * typed differently — and guessing there would answer a typo by inventing a
 * second person rather than by finding the first. `crew-check.mjs` reports
 * which names the roster has, so the gap is seen before this is flipped.
 */
const raw = process.env.CREWS_JSON;
if (!raw) {
  console.error('CREWS_JSON is required.');
  process.exit(1);
}

const spec = JSON.parse(raw);
if (!spec.post || !Array.isArray(spec.crews)) {
  console.error('CREWS_JSON needs a "post" and a "crews" array.');
  process.exit(1);
}

/** SQL string literal: the only escape SQLite has is a doubled quote. */
const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const post = q(spec.post);
const lines = [];

// The post, by id or by the name it is known under.
const postId = `(SELECT id FROM assignment_types WHERE id = ${post} OR name = ${post} LIMIT 1)`;

lines.push(`DELETE FROM assignment_type_crews WHERE assignment_type_id = ${postId};`);

spec.crews.forEach((crew, index) => {
  const crewId = q(`crw_${Date.now().toString(36)}${index}`);
  lines.push(
    `INSERT INTO assignment_type_crews (id, assignment_type_id, name, position, active, created_at, updated_at)`,
    `  SELECT ${crewId}, ${postId}, ${q(crew.name)}, ${index + 1}, 1, 0, 0;`,
  );
  for (const [seatIndex, member] of (crew.members ?? []).entries()) {
    const person = q(member.person);
    const personId = `(SELECT id FROM personnel WHERE display_name = ${person} AND status = 'active' LIMIT 1)`;
    if (member.create) {
      // Only where the roster has nobody by that name: running this twice must
      // not leave the company with the same soldier standing twice.
      const newId = q(`prs_${Date.now().toString(36)}${index}${seatIndex}`);
      lines.push(
        `INSERT INTO personnel (id, org_id, display_name, status, created_at, updated_at)`,
        `  SELECT ${newId}, (SELECT id FROM organizations LIMIT 1), ${person}, 'active', 0, 0`,
        `   WHERE NOT EXISTS (SELECT 1 FROM personnel`,
        `                      WHERE display_name = ${person} AND status = 'active');`,
      );
    }
    const seat = member.seat
      ? `(SELECT id FROM qualifications WHERE code = ${q(member.seat)} LIMIT 1)`
      : 'NULL';
    if (member.seat) {
      lines.push(
        `INSERT OR IGNORE INTO personnel_qualifications (personnel_id, qualification_id, granted_at)`,
        `  SELECT ${personId}, ${seat}, 0 WHERE ${personId} IS NOT NULL AND ${seat} IS NOT NULL;`,
      );
    }
    lines.push(
      `INSERT OR IGNORE INTO assignment_type_crew_members (crew_id, personnel_id, role_qualification_id)`,
      `  SELECT ${crewId}, ${personId}, ${seat} WHERE ${personId} IS NOT NULL;`,
    );
  }
});

console.log(lines.join('\n'));
