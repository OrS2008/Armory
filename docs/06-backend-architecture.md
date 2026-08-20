# Backend architecture

Cloudflare Pages Functions on the Workers runtime, D1 (SQLite) for storage.

```
functions/
├── _lib/
│   ├── http.ts       envelope, JSON + Zod body parsing, origin check, crypto helpers
│   ├── auth.ts       PBKDF2 hashing, sessions, requireUser, requireScope, throttling
│   ├── data.ts       D1 queries, row → domain mapping, evaluateWindow
│   ├── audit.ts      audit statements, diffs, notification statements
│   └── schedules.ts  schedule loading and window resolution
└── api/v1/…          one file per route, file-based routing
```

The plan's NestJS module list survives as this directory structure: `auth`,
`personnel`, `units`, `qualifications`, `availability`, `assignment-types`,
`assignments`, `schedules`, `rules`, `conflicts`, `replacements`,
`notifications`, `audit`, `reports`.

## Request shape

```ts
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const origin = checkOrigin(request);            // same-origin only
  if (origin) return origin;
  const user = await requireUser(request, env, Permissions.assignmentsAssign);
  if (user instanceof Response) return user;      // 401 / 403
  const input = await readBody(request, schema);  // 422 with Hebrew field errors
  if (input instanceof Response) return input;
  const outOfScope = await requireScope(env, user, unitId);
  if (outOfScope) return outOfScope;              // 403 OUT_OF_SCOPE
  …
};
```

Guards return a `Response`; `instanceof Response` is the early exit. No
middleware layer hides an authorisation check.

## Transactions

D1 has no interactive transactions. `env.DB.batch([...])` runs its statements in
one implicit transaction, so anything that must be all-or-nothing is expressed
as a single batch:

- **Publication** — mark assignments published, bump the schedule version, write
  the immutable snapshot, insert notifications, write the audit event.
- **Replacement approval** — remove the original person, add the replacement,
  flag the assignment as modified, audit.
- **Assignment** — insert the row and update the publication state together.

## One evaluation path

`evaluateWindow` in `_lib/data.ts` loads the assignments, personnel,
availability, rules and qualification names for a window and runs the shared
engine. The board, the conflicts screen, assignment writes and publication all
call it, so a warning never depends on which endpoint produced it.

## Performance notes

- The window query is served by `idx_assignments_window`; assignees are fetched
  with one follow-up `IN (…)` query rather than per-row.
- Independent loads run through `Promise.all`.
- Candidate ranking is O(people × their assignments) over one window — fine at
  company scale, and the place to look first if a battalion-sized roster is
  loaded.

## Known gaps

- **No WebSockets.** Live collaboration and presence ("יוסי עורך כרגע…") need
  Durable Objects. The client polls instead.
- **No background jobs.** Upcoming-assignment reminders will need Cron Triggers
  or Queues.
- **No structured request logging or external error tracking.**
- `login_attempts` is pruned opportunistically on each login rather than by a
  scheduled job.
