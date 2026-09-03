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
console.log(
  `SELECT ${q(spec.post ?? '')} AS post, display_name, status
     FROM personnel WHERE display_name IN (${list}) ORDER BY display_name;`,
);
