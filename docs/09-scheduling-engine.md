# Scheduling engine

The engine lives in `shared/`, so the identical code decides a conflict in the
API and renders a warning in the board. There is no second implementation to
drift.

```
shared/time.ts        UTC storage, Asia/Jerusalem display, DST-safe conversion
shared/conflicts.ts   Rule evaluation over a window  →  Conflict[]
shared/fairness.ts    Workload signals and the fairness score
shared/candidates.ts  Ranked, explainable suggestions for one assignment
shared/recurrence.ts  Recurring assignment expansion
```

## Time model

Every timestamp is epoch milliseconds in UTC. The only local values are
`YYYY-MM-DD` day keys, always resolved against an explicit timezone stored on
the organisation (default `Asia/Jerusalem`).

`wallClockToUtc` converts a local reading to an instant, then re-checks the
offset actually in force at the candidate instant — the naive `local - offset`
answer is wrong around a DST transition. Consequences that are tested:

- The spring-forward day is 23 hours long and the autumn day 25; the day
  timeline draws the correct number of hour ticks for each.
- A recurring 06:00 assignment stays at 06:00 across the transition rather than
  drifting to 05:00 or 07:00.

Intervals are half-open, `[start, end)`, so an assignment ending at 12:00 and
one starting at 12:00 do not overlap.

## Rules

Rules are rows in `scheduling_rules`, not code. Each has an enabled flag, a
severity (`info` / `warning` / `blocking`), an overridable flag and a JSON
config. Changing a rule changes behaviour without a deployment.

| Code | Default severity | Config | What it checks |
| --- | --- | --- | --- |
| `NO_OVERLAP` | blocking | — | One person on two overlapping assignments |
| `AVAILABILITY_REQUIRED` | blocking | — | Assignment overlaps an approved absence |
| `QUALIFICATION_REQUIRED` | blocking | per-qualification `minCount` | A qualification the crew lacks — see below |
| `MIN_REST` | warning | `minutes: 480` | Gap before the assignment is too short |
| `MAX_CONTINUOUS` | warning | `minutes: 720` | A single assignment runs too long |
| `MAX_ASSIGNMENTS_PER_DAY` | warning | `count: 2` | Too many assignments on one local day |
| `MAX_HOURS_IN_WINDOW` | warning | `hours: 60, windowDays: 7` | Rolling-window hour cap |
| `UNDERSTAFFED` | warning | — | Fewer assignees than the required headcount |
| `OVERSTAFFED` | info | — | More assignees than required |
| `UNPUBLISHED_CHANGES` | info | — | Assignment not in the published state |

Expired qualifications are filtered out when personnel are loaded, so a lapsed
certification blocks an assignment exactly like a missing one.

### Two ways to need a qualification

An assignment type attaches qualifications with a `minCount`, because "everyone
on this must be a qualified driver" and "there must be a driver among them" are
different requirements and a roster needs both:

| `minCount` | Meaning | Reported against |
| --- | --- | --- |
| `0` | Every assignee must hold it | The person who lacks it |
| `N > 0` | At least N of the assignees must hold it | The assignment |

A four-person patrol that must include one driver and one commander is two
requirements at `minCount: 1`. Modelling it at `0` would demand four people who
are each both, which is why the distinction exists. The crew-level shortfall is
reported against the assignment rather than blamed on an individual, since no
single assignee is at fault.

Candidate ranking knows about open seats: someone holding a qualification the
crew is still short of gains 25 points and a reason saying so, which lifts them
above an equally rested peer who would leave the gap open.

## Conflict shape

Every conflict answers the four questions the plan asks for:

```json
{
  "code": "NO_OVERLAP",
  "severity": "blocking",
  "overridable": true,
  "assignmentId": "asg_…",
  "personnelId": "per_…",
  "subject": "דניאל כהן",
  "message": "לא ניתן לשבץ את דניאל כהן למשימה זו — קיימת חפיפה עם שמירה בין 14:00–16:00.",
  "resolution": "הסירו את השיבוץ הכפול או שנו את שעות אחת המשימות."
}
```

Hebrew text comes from `shared/messages.he.ts`; nothing is hardcoded in a
handler or a component.

## Where the engine runs

| Moment | Endpoint | Effect |
| --- | --- | --- |
| Board load | `GET /assignments` | Conflicts for the visible window |
| Conflicts screen | `GET /conflicts` | Window conflicts plus a severity summary |
| Assigning a person | `POST /assignments/:id/assign` | Simulated first; blocking conflicts refuse the write |
| Editing an assignment | `PATCH /assignments/:id` | Saved, and the resulting conflicts returned |
| Before publishing | `POST /schedules/:id/validate` | Dry run of the publication gate |
| Publishing | `POST /schedules/:id/publish` | Refuses while any blocking conflict remains |

## Overrides

A blocking conflict refuses the assignment with `409 SCHEDULING_CONFLICT` and
the conflicts in `details`. A commander holding `assignments.override` may retry
with an `overrideReason`, and only if every blocking rule involved is marked
overridable. The reason is stored on the assignment row, the override is written
to the audit log as its own event, and the engine then skips that person on that
assignment — the override is recorded, not forgotten.

## Fairness and candidates

`computeWorkload` measures total, night (22:00–06:00) and weekend (Friday and
Saturday) hours plus the assignment count in a window, and combines them with
configurable weights. Night and weekend hours weigh more than ordinary hours.

`rankCandidates` scores each person out of 100:

- 70 points scaled by how light their recent workload is, relative to the pool.
- 20 points for qualification match (full marks when the type requires none).
- Up to 10 points for rest before the assignment.
- −12 per soft warning the assignment would create.
- 0, and `eligible: false`, if it would create any blocking conflict.

Every candidate carries `reasons`, `warnings` and `blockers` as Hebrew strings,
and the UI shows them next to the number. The scheduler always chooses; the
engine never assigns anyone.

## Not implemented

Phase 2 assisted auto-fill and phase 3 CP-SAT optimisation are not built. The
plan makes them conditional on the unit's scheduling policy being agreed first
(plan section 48), and the rule table is where that policy will live.
