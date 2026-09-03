# Permissions matrix

Roles and permissions are defined once, in `shared/rbac.ts`, and enforced
server-side in every handler. The client uses the same table only to decide what
to render — a hidden button is never treated as access control.

## Roles

| Role | Hebrew | Intended holder |
| --- | --- | --- |
| `system_admin` | מנהל מערכת | System administration, user management, security settings |
| `company_commander` | מפקד פלוגה | Full company scheduling, publication, overrides, rules |
| `unit_scheduler` | משבץ מחלקתי | Scheduling inside an assigned organisational scope |
| `soldier` | חייל | Personal schedule, availability requests, replacement requests |
| `viewer` | צופה | Read-only access to schedules and reports |

## Permissions

| Permission | system_admin | company_commander | unit_scheduler | soldier | viewer |
| --- | :-: | :-: | :-: | :-: | :-: |
| `personnel.read` | ✓ | ✓ | ✓ | | ✓ |
| `personnel.write` | ✓ | ✓ | ✓ | | |
| `units.read` | ✓ | ✓ | ✓ | | ✓ |
| `units.write` | ✓ | ✓ | | | |
| `qualifications.read` | ✓ | ✓ | ✓ | | ✓ |
| `qualifications.write` | ✓ | ✓ | | | |
| `availability.read` | ✓ | ✓ | ✓ | | ✓ |
| `availability.write` | ✓ | ✓ | ✓ | | |
| `availability.request` | | | | ✓ | |
| `availability.approve` | ✓ | ✓ | ✓ | | |
| `assignment_types.read` | ✓ | ✓ | ✓ | | ✓ |
| `assignment_types.write` | ✓ | ✓ | | | |
| `assignments.read` | ✓ | ✓ | ✓ | | ✓ |
| `assignments.write` | ✓ | ✓ | ✓ | | |
| `assignments.assign` | ✓ | ✓ | ✓ | | |
| `assignments.override` | ✓ | ✓ | | | |
| `schedules.read` | ✓ | ✓ | ✓ | | ✓ |
| `schedules.write` | ✓ | ✓ | ✓ | | |
| `schedules.publish` | ✓ | ✓ | | | |
| `rules.read` | ✓ | ✓ | ✓ | | ✓ |
| `rules.write` | ✓ | ✓ | | | |
| `replacements.read` | ✓ | ✓ | ✓ | | ✓ |
| `replacements.request` | | | | ✓ | |
| `replacements.decide` | ✓ | ✓ | ✓ | | |
| `reports.read` | ✓ | ✓ | ✓ | | ✓ |
| `audit.read` | ✓ | ✓ | | | |
| `users.manage` | ✓ | | | | |
| `settings.manage` | ✓ | | | | |
| `self.read` | ✓ | ✓ | ✓ | ✓ | ✓ |

Two deliberate limits: a unit scheduler may assign people but may neither
publish a schedule nor override a blocking rule, and a commander may read the
audit log but may not manage user accounts or security settings.

## Organisational scope

A user may additionally be limited to part of the unit tree. `user_scopes` holds
the granted unit ids; an empty scope means company-wide.

- A unit is in scope when it is a granted unit or a descendant of one
  (`unitInScope`, `shared/rbac.ts`).
- List endpoints narrow their queries to the expanded scope (`expandScope`).
- Write endpoints check the scope of both the current and the target unit, so a
  scoped scheduler cannot move a person out of their scope.
- Personnel with no unit are invisible to a scoped user.

## Self-service rules

- A soldier reads only their own availability, and `/me/schedule` returns only
  their own rows, with draft assignments withheld until publication.
- A soldier's availability entry is created as `pending`; a scheduler's entry is
  `approved` immediately.
- A soldier may delete only their own still-pending availability request.
- A replacement request may be opened for oneself, or by someone who can decide
  replacements.
- Withdrawing a replacement request you opened yourself needs no permission:
  it is not a decision. `PATCH /replacements/:id` accepts `cancelled` from the
  requester while the request is still undecided; everything else about it
  still needs `replacements.decide`.
- `POST /replacements/:id/respond` is authorised by **identity rather than
  permission**: only the person named as the stand-in may answer. A system
  administrator holds every permission there is and is refused here, because
  consent is not a permission — and a permission that could grant it would make
  the record of the answer worth nothing.

## Not implemented

`settings.manage` is defined and enforced but nothing calls it yet; the
settings that exist are covered by the more specific permissions above.

## User administration

`users.manage` gates `GET/POST /users` and `PATCH /users/:id`, and the
משתמשים tab in settings. Three guards stop the screen locking the unit out of
its own system:

- Nobody may change their own role or switch their own account off.
- The last active `system_admin` may not be demoted or deactivated.
- A reset password, a changed role or a deactivation revokes that account's
  sessions, so an open browser somewhere does not keep the old access.

A person changes their own password through `POST /auth/password`, which
verifies the current one and signs out every other device. An administrator
resetting someone else's goes through `PATCH /users/:id` — a different act,
recorded separately in the audit trail.
