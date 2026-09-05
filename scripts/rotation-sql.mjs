/**
 * Seats a post's crews across the shifts already on the board, a tour at a
 * time.
 *
 * Who stands חפ״ק in a given week is arithmetic — the crews take their turns in
 * order, one tour each, from a fixed anchor — so this is a roster being written
 * out, not a search being run. That is the whole reason it is not the auto-fill
 * doing it: auto-fill weighs candidates against each other, and there is
 * nothing here to weigh. It also runs in the browser one day at a time, and
 * seventy days is not seventy clicks.
 *
 * It reads the shifts and crews out of the database by name and writes the
 * seating, so nobody's name is in this file or in the SQL it is committed
 * beside. Seats are filled by mark: the member recorded as the crew's נהג takes
 * the נהג seat, which is what makes the printed sheet name the right job
 * beside the right person.
 *
 * Existing seating on a shift is left alone unless REPLACE is set. A shift
 * somebody was deliberately put on is a decision, and a roster generator is not
 * entitled to overrule it silently.
 *
 *   POST='חפק' FROM_DAY=2026-09-03 TO_DAY=2026-11-11 \
 *   ANCHOR_DAY=2026-09-03 PERIOD_DAYS=7 node scripts/rotation-sql.mjs
 */
const post = process.env.POST ?? '';
const fromDay = process.env.FROM_DAY ?? '';
const toDay = process.env.TO_DAY ?? '';
const anchorDay = process.env.ANCHOR_DAY ?? fromDay;
const periodDays = Number(process.env.PERIOD_DAYS ?? 7);
const replace = /^(1|true|yes)$/i.test(process.env.REPLACE ?? '');

const isDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);
if (!post || !isDay(fromDay) || !isDay(toDay) || !isDay(anchorDay)) {
  console.error('POST, FROM_DAY, TO_DAY and ANCHOR_DAY (YYYY-MM-DD) are required.');
  process.exit(1);
}
if (!Number.isInteger(periodDays) || periodDays < 1) {
  console.error('PERIOD_DAYS must be a whole number of days, at least one.');
  process.exit(1);
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const postId = `(SELECT id FROM assignment_types WHERE name = ${q(post)} OR id = ${q(post)} LIMIT 1)`;

/*
 * The turn a day belongs to, counted in whole days from the anchor.
 *
 * SQLite's julianday gives the day number directly, and doing the arithmetic in
 * the database rather than here means the shifts never have to be read out and
 * fed back in — which matters, because the only channel to production is a
 * workflow running a file of SQL.
 *
 * CAST truncates toward zero, so a day before the anchor would land in the
 * anchor's own turn and make that turn twice as long. Subtracting one for the
 * negative case floors it instead. `date(...,'localtime')` is deliberately not
 * used: the runner is UTC, and a turn boundary must not depend on where the
 * command happened to run.
 */
const dayNumber = `CAST(julianday(date(i.start_at / 1000, 'unixepoch')) - julianday(${q(anchorDay)}) AS INTEGER)`;
const turn = `CASE WHEN ${dayNumber} < 0
                   THEN (${dayNumber} - ${periodDays} + 1) / ${periodDays}
                   ELSE ${dayNumber} / ${periodDays} END`;

/*
 * The crews, numbered from zero in the order they take their turns.
 *
 * Numbering them here rather than picking one with LIMIT/OFFSET is not a
 * stylistic choice: SQLite will not take a correlated expression as an OFFSET,
 * and the offset is exactly the thing that depends on the shift's own date. As
 * a derived table the turn number becomes an ordinary comparison in WHERE,
 * which correlates fine. `position` need not be contiguous — ROW_NUMBER makes
 * it so.
 */
const rota = `(SELECT c.id,
                      ROW_NUMBER() OVER (ORDER BY c.position) - 1 AS idx,
                      COUNT(*) OVER () AS n
                 FROM assignment_type_crews c
                WHERE c.assignment_type_id = ${postId})`;

const inRange = `i.assignment_type_id = ${postId}
     AND date(i.start_at / 1000, 'unixepoch') BETWEEN ${q(fromDay)} AND ${q(toDay)}
     AND i.status <> 'cancelled'`;

const lines = [];

if (replace) {
  // Only the seats this roster owns. Somebody put on the shift by hand outside
  // the crews is a decision by a person and survives.
  lines.push(
    `DELETE FROM assignment_personnel`,
    ` WHERE assignment_id IN (SELECT i.id FROM assignment_instances i WHERE ${inRange})`,
    `   AND personnel_id IN (SELECT m.personnel_id FROM assignment_type_crew_members m`,
    `                         JOIN assignment_type_crews c ON c.id = m.crew_id`,
    `                        WHERE c.assignment_type_id = ${postId});`,
  );
}

/*
 * One statement writes the whole period.
 *
 * `id` has to be unique per row and SQLite has no uuid, so it is built from the
 * shift and the person — which also makes the insert idempotent in fact as well
 * as by the OR IGNORE: running it twice produces the same ids, not a second set.
 */
lines.push(
  `INSERT OR IGNORE INTO assignment_personnel`,
  `  (id, assignment_id, personnel_id, role_qualification_id, assigned_at)`,
  `SELECT 'apr_' || substr(i.id, -12) || '_' || substr(m.personnel_id, -10),`,
  `       i.id, m.personnel_id, m.role_qualification_id, 0`,
  `  FROM assignment_instances i`,
  `  JOIN ${rota} r`,
  `  JOIN assignment_type_crew_members m ON m.crew_id = r.id`,
  ` WHERE r.idx = ((${turn}) % r.n + r.n) % r.n`,
  `   AND ${inRange}`,
  // Without this a shift already crewed gets this week's crew added alongside
  // whoever is on it, which is how a post for four ends up with eight names.
  `   AND NOT EXISTS (SELECT 1 FROM assignment_personnel ap WHERE ap.assignment_id = i.id);`,
);

console.log(lines.join('\n'));
