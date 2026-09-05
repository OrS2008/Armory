/**
 * Refuses anything but a single question.
 *
 * The query workflow exists so production can be read without editing a
 * workflow, and the moment such a thing exists somebody — me — will paste an
 * UPDATE into it by accident. So the statement is checked here, before
 * wrangler is handed it: one statement, starting with SELECT or WITH, with no
 * second statement hiding behind a semicolon.
 *
 * Comments are stripped before the check rather than allowed through, because
 * `/* *\/ DELETE FROM personnel` reads as a comment to a regular expression
 * and as a delete to SQLite.
 */
const sql = (process.env.SQL ?? '').trim();
if (!sql) {
  console.error('SQL is required.');
  process.exit(1);
}

const bare = sql
  .replace(/--[^\n]*/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .trim()
  .replace(/;\s*$/, '');

if (!/^(select|with)\b/i.test(bare)) {
  console.error('::error::This workflow reads. The statement has to start with SELECT or WITH.');
  process.exit(1);
}

// A trailing semicolon was already dropped; any that is left separates two
// statements, and the second one is the one nobody read.
if (bare.includes(';')) {
  console.error('::error::One statement only. Ask the second question in a second run.');
  process.exit(1);
}

console.log('Reads only. Asking:');
console.log(bare);
