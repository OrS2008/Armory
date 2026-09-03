# Database schema

Cloudflare D1 (SQLite). One migration, `migrations/0001_init.sql`, applied with
`wrangler d1 migrations apply`.

## Conventions

- Ids are prefixed UUIDs without dashes: `per_…`, `asg_…`, `sch_…`.
- Every timestamp is `INTEGER` epoch milliseconds in UTC. Schedule ranges use
  `TEXT` `YYYY-MM-DD` day keys, resolved against the organisation timezone.
- Booleans are `INTEGER` with a `CHECK (… IN (0,1))`.
- Enumerations are `TEXT` with a `CHECK` constraint, so a bad value fails at the
  database, not only in Zod.
- Nothing business-relevant is hard-deleted: personnel are archived, assignments
  are cancelled.

## Tables

### Identity

| Table | Purpose |
| --- | --- |
| `users` | Account, role, PBKDF2 password hash + salt + iteration count, optional link to a `personnel` row |
| `user_scopes` | Unit ids a user is limited to; empty means company-wide |
| `sessions` | Session token hashes, expiry, last seen, revocation |
| `login_attempts` | Short-lived record backing the brute-force guard |

### Organisation

| Table | Purpose |
| --- | --- |
| `organizations` | Name, IANA timezone, week start day |
| `units` | Self-referencing tree: company → platoon → team |
| `personnel` | Roster entry; `UNIQUE(org_id, external_id)` |
| `qualifications` | Generic authorisation tags and marks; `UNIQUE(org_id, code)`. `exclusive` narrows its holder to the posts that require it; `blocks_scheduling` takes them out of the rotation entirely |
| `personnel_qualifications` | Holdings, with an optional expiry |

### Scheduling

| Table | Purpose |
| --- | --- |
| `availability` | Absence or availability window with an approval status; `CHECK (end_at > start_at)` |
| `assignment_types` | Reusable definition: default duration, headcount, priority, colour. `standing` + `shift_hours` + `shift_start_hour` describe a post covered round the clock, which is what the fixed roster is generated from |
| `assignment_type_qualifications` | Qualifications a type requires; `min_count` 0 binds every seat, N binds N of them |
| `assignment_type_exclusions` | Marks a type refuses — the mirror image of the row above |
| `schedules` | Named date range with a status and a version counter |
| `schedule_versions` | Immutable JSON snapshot written on each publication |
| `assignment_instances` | A concrete occurrence, with `status` and `publication_state` |
| `assignment_personnel` | Who is on it, who assigned them, acknowledgement, override reason |
| `scheduling_rules` | The configurable policy: enabled, severity, overridable, JSON config |
| `replacement_requests` | Swap workflow, including the stand-in a requester named and whether that person agreed |
| `shift_volunteers` | Offers to stand a seat nobody is on. Not a replacement: there is nobody to replace |
| `notifications` | Per-user in-app notifications |
| `audit_events` | Append-only trail |

### Relationships

```
organizations
  ├── units ──┬── units (children)
  │           └── personnel ──┬── personnel_qualifications ── qualifications
  │                           └── availability
  ├── assignment_types ─┬─ assignment_type_qualifications ── qualifications
  │                     └─ assignment_type_exclusions ────── qualifications
  ├── scheduling_rules
  └── schedules ──┬── schedule_versions
                  └── assignment_instances ── assignment_personnel ── personnel
```

## Indexes

Chosen for the queries the board actually runs:

- `idx_assignments_window (org_id, start_at, end_at)` — the window query behind
  every board load.
- `idx_availability_person (personnel_id, start_at, end_at)` — absence lookup
  during conflict evaluation.
- `idx_assignment_personnel_person (personnel_id)` — a person's timeline.
- `idx_sessions_expires`, `idx_login_attempts_email`, `idx_audit_created`.

## Append-only audit

`audit_events` has `BEFORE UPDATE` and `BEFORE DELETE` triggers that
`RAISE(ABORT, 'audit_events is append-only')`. The application has no update or
delete path, and the database refuses one regardless.

For the same reason the table has **no foreign key to `users`**: a cascading
`ON DELETE SET NULL` would be an UPDATE, which the trigger forbids — deleting a
user would fail. The actor id is stored as plain text alongside a denormalised
`actor_name`, so an audit row stays readable after the account is gone.

## Baseline data

The migration inserts the default organisation (`org_default`, Asia/Jerusalem)
and the ten scheduling rules with their default severities. `scripts/seed-demo.sql`
adds demo units, personnel, qualifications and assignment types **for local
development only** — it deletes existing rows and must never be run against
production.

## Multi-organisation

Every scoped table carries `org_id` and the code funnels through
`DEFAULT_ORG_ID` in `functions/_lib/data.ts`. Multi-company support (plan V2)
means resolving that id from the session instead of the constant; the schema
does not need to change.
