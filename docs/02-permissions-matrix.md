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

## Not implemented

User administration has no UI or endpoints yet: accounts are created by the
first-run bootstrap and then directly in the database. `users.manage` and
`settings.manage` are defined and enforced, but nothing calls them yet.
