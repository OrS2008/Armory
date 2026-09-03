# Product requirements

## Problem

Company scheduling happens in spreadsheets, WhatsApp messages and handwritten
tables. Nobody has one authoritative picture of who is available; double-bookings
and rest violations are found after the fact; a soldier cannot reliably answer
"when am I next on duty?"; and nothing records who changed what.

## Goals

1. One source of truth for availability and assignments.
2. Prevent double-booking and obvious scheduling errors before publication.
3. Enforce configurable rest, availability, qualification and staffing rules.
4. Make schedule building materially faster for a commander.
5. Give every soldier a simple personal view.
6. Record accountability for every change.
7. Work well on a phone, in Hebrew, right-to-left.

## Non-goals

Tactical planning of any kind (see `docs/10-security-model.md`), payroll,
personnel evaluation, and anything requiring intelligence data.

## Users

| Role | Primary job |
| --- | --- |
| System administrator | Accounts, security settings, system configuration |
| Company commander | Build and publish the schedule, set policy, override where allowed |
| Unit scheduler | Schedule inside their platoon or team |
| Soldier | See their own schedule, request availability changes and replacements |
| Viewer | Read schedules and reports |

## Functional requirements

### Personnel and organisation

- Roster with unit, role title, service number, phone, status, notes.
- Configurable unit hierarchy: company → platoon → team.
- Qualifications as generic authorisation tags, with optional expiry; an expired
  qualification counts as absent.
- Search and filter by name, service number, role, unit, qualification, status.
- Archive rather than delete — history stays intact.

### Availability

- Windows with a category: available, leave, training, medical, home, other.
- Approval workflow; a soldier's entry is a request, a scheduler's is immediate.
- **The engine never treats an unavailable person as eligible** unless an
  authorised override is explicitly used.

### Assignments

- Assignment types define default duration, required headcount, priority,
  colour, instructions and required qualifications.
- Instances carry their own times, headcount, unit, notes, status and
  publication state.
- Recurrence: daily or selected weekdays, until a date, preserving wall-clock
  time across DST.
- Overnight assignments crossing midnight are first-class.

### Conflicts

Ten rule types with configurable severity — see `docs/09-scheduling-engine.md`.
Every conflict states what happened, who is affected, why it matters and how to
resolve it. Blocking conflicts refuse the write; a commander may override an
overridable rule with a recorded reason.

### Publication

Draft → validate → publish. Publication is atomic, versioned with an immutable
snapshot, notifies affected people, and is refused while any blocking conflict
remains. Editing a published assignment marks it "changed" until republished.

### Personal experience

Own schedule and availability only; acknowledge an assignment; in-app
notifications; and three things a soldier can do without asking anybody:

- **Subscribe to their own duty times** from the calendar already on their
  phone, which is what actually answers "when am I next on duty?" — it rings on
  its own and works when the app does not.
- **Find their own cover.** Ask for a replacement and name somebody from a list
  the engine says could actually stand it. The named person answers for
  themselves; the commander still approves.
- **Take a seat nobody is standing.** See the holes in the coming week they are
  eligible for, and offer. An offer is not an assignment.

### Accountability

Every meaningful change writes an append-only audit entry with actor, action,
entity and a minimal metadata diff.

## Non-functional requirements

| Area | Requirement | Status |
| --- | --- | --- |
| Language | Hebrew RTL throughout, `DD/MM/YYYY`, 24-hour time, Asia/Jerusalem | Met |
| Mobile | Usable on 375 px; personal view excellent on a phone | Met |
| Security | Server-side authorisation, hashed passwords, session management, CSP, audit | Met, except MFA — see the security model |
| Time correctness | UTC storage, DST-safe conversion | Met, with tests |
| Performance | p95 API reads < 300 ms, board usable in < 2 s | Not measured |
| Accessibility | WCAG 2.2 AA where practical | Followed by construction; not audited |
| Availability | Backups and point-in-time recovery | Platform feature; must be enabled and rehearsed |

## MVP scope — delivered

Authentication, RBAC with scope, personnel, units, qualifications, availability,
assignment types, assignment instances, day/week/personnel board, manual
assignment, conflict detection, drafts, publication, personal view,
notifications, audit log, Hebrew RTL, responsive mobile UI.

## Post-MVP

Delivered: user administration and MFA; drag-and-drop with undo on the sheet;
CSV import with a dry run, PDF and Excel export; command palette, global search
and keyboard shortcuts; PWA offline caching; assisted auto-fill with a repair
pass; the standing roster; the personal calendar feed; peer cover with consent;
and volunteering for open seats.

Still open, in order:

1. Templates and "duplicate last week".
2. Live updates over Durable Objects; presence indicators.
3. Constraint optimisation beyond the repair pass — see
   `docs/09-scheduling-engine.md`, which explains why it will not be built in
   this runtime.

**Reminder notifications** are answered by the calendar feed rather than by a
cron: a subscribed calendar raises its own alarm an hour before a shift, on the
device the soldier actually carries, and keeps doing it while we are offline.
