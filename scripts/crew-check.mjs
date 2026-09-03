/**
 * Which of the named people the roster actually has, before anything is
 * written.
 *
 * The SQL that lays out a crew matches people by the name the roster already
 * holds, and silently skips one it cannot find — a crew quietly three strong.
 * This asks first. Like `crew-sql.mjs`, the names arrive at run time and are
 * never written down here.
 */
const spec = JSON.parse(process.env.CREWS_JSON ?? '{}');
const names = (spec.crews ?? []).flatMap((crew) =>
  (crew.members ?? []).map((member) => member.person),
);
if (names.length === 0) {
  console.log('SELECT 0 AS people_named;');
  process.exit(0);
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const list = names.map(q).join(',');
const post = q(spec.post ?? '');
// The post itself first: laying a crew on one that is not there fails on a
// foreign key, which says far less than naming the post that is missing.
console.log(
  `SELECT 'post' AS row, id AS a, name AS b, CAST(active AS TEXT) AS c
     FROM assignment_types WHERE id = ${post} OR name = ${post}
   UNION ALL
   SELECT 'person', display_name, status, ''
     FROM personnel WHERE display_name IN (${list})
   ORDER BY row, a;`,
);
