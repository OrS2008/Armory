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
| `MIN_REST` | blocking | `minutes: 960` | Gap before the assignment is too short |
| `MAX_CONTINUOUS` | blocking | `minutes: 480` | A run of touching shifts is too long |
| `MAX_ASSIGNMENTS_PER_DAY` | warning | `count: 2` | Too many assignments on one local day |
| `MAX_HOURS_IN_WINDOW` | warning | `hours: 60, windowDays: 7` | Rolling-window hour cap |
| `UNDERSTAFFED` | warning | — | Fewer assignees than the required headcount |
| `OVERSTAFFED` | info | — | More assignees than required |
| `EXCLUDED_QUALIFICATION` | blocking | — | A mark the post refuses — see below |
| `NOT_SCHEDULABLE` | blocking | — | A mark that takes its holder out of the rotation |
| `UNPUBLISHED_CHANGES` | off | — | Assignment not in the published state (see below) |

Expired qualifications are filtered out when personnel are loaded, so a lapsed
certification blocks an assignment exactly like a missing one.

### Eight on, sixteen off

The company's aim is an eight-hour shift followed by sixteen hours of rest, so
`MIN_REST` is 960 minutes and `MAX_CONTINUOUS` is 480. Both are **blocking and
overridable**: auto-fill will never break them, and a commander still can, with
a reason that is recorded as its own audit event. A warning would have been the
wrong shape — nothing acts on a warning, and the schedule went on handing people
sixteen straight hours while dutifully reporting that it had.

### `UNPUBLISHED_CHANGES` is off

There is no publication step: the duty sheet goes out as a PDF in the group
chat, so exporting it *is* publishing it. The rule is kept for a unit that wants
to run one, and can be switched back on in הגדרות ← כללי שיבוץ.

### Marks that disqualify

A post can say what it requires. It also has to be able to say who it will not
take, and that is not expressible as a requirement on anybody else: "אי אפשר
לשבץ חייל מהמבצעים" is a fact about מבצעים.

| Where | Meaning |
| --- | --- |
| `assignment_type_exclusions` | Holding this mark disqualifies you from **this post** |
| `qualifications.blocks_scheduling` | Holding this mark takes you out of the rotation **entirely** |
| `qualifications.exclusive` | Holding this mark narrows you to the posts that require it |

The company's marks, as seeded:

| Mark | Kind | Effect |
| --- | --- | --- |
| נהג | requirement | One among the four on עיט, כיתת כוננות א׳ כרמל and חפ"ק |
| מפקד | requirement, and an exclusion | One among the four on עיט, כיתת כוננות א׳ כרמל and חפ"ק; barred from ש״ג |
| מבצעים | exclusion | Barred from every routine line post: עיט, כיתת כוננות א׳ כרמל, נחל שכם, ש״ג, חובש תורן, חפ"ק and חמ"ל |
| מפלג | `blocks_scheduling` | Never scheduled — מפלג is a job, not a shift |
| קצין מוצב | `exclusive` | Stands קצין מוצב and nothing else |
| חובש | requirement | The one seat on חובש תורן |

All three are blocking and overridable, so a commander who has to can still say
yes and the reason is recorded.

## The fixed roster

The company's standing posts are not decided each morning: they run round the
clock for months, each on its own rhythm. Asking for them a day at a time is
asking somebody to retype a fact that never changes, so a post carries its own
rhythm —

| Column | Meaning |
| --- | --- |
| `standing` | Covered without a break, 24 hours a day |
| `shift_hours` | Length of one handover; must divide 24 exactly |
| `shift_start_hour` | Wall-clock hour of the day's first handover |

— and `planStandingShifts` turns a date range plus those posts into the exact
list of shifts the period needs. It is a pure function: `POST
/api/v1/assignments/standing` decides which of them already exist and writes
only the rest, which is what makes running it twice harmless. A shift that was
deliberately cancelled counts as existing, so re-running never resurrects it.

Shifts are pinned to the wall clock, so a 16:00 handover stays at 16:00 across a
daylight-saving change; the handover either side of it is then an hour shorter
or longer, which is what happens on the ground.

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

## Assisted auto-fill

`shared/autofill.ts` builds a **proposal**, never a schedule. It walks the
understaffed assignments in chronological order — filling the hardest crew
first within any given hour, so a post needing a commander does not lose the
last one to a post that needs nobody — and picks the top-ranked eligible
candidate for each seat, making each choice visible to the next so nobody is
booked twice.

Every pick comes from `rankCandidates`, so an auto-filled seat is explainable in
exactly the same terms as a hand-picked one, and the same blocking rules apply.
Where no eligible person exists the seat is reported as a gap rather than filled
with someone who breaks a rule.

It runs **in the browser**, over data already on screen. A week of ranking is
far more CPU than a single request may spend on Cloudflare, and the work does
not need to be trusted: `POST /assignments/bulk-assign` re-runs the engine over
the whole window with every proposed placement applied, drops any pairing that
would create a blocking conflict, and writes the rest in one batch. The client
is a convenience; the server remains the authority.

The commander reviews the proposal and can strike any line before approving —
automation assists the scheduler, it does not decide who stands at a gate.

Measured on a real company: 40 people, four standing posts on 8-hour rotation,
33 seats in a day, three of the forty marked מבצעים and therefore barred from
every one of those posts. Filled in about half a second with no gaps, using 33
distinct people at one shift each — which is what sixteen hours of rest forces,
and what the repair pass (six swaps here) is needed to reach.

## Auto-fill: greedy, then repair

The first pass reads the day in order and fills seat by seat, named seats
first, using the same ranking the manual candidate picker uses. It never looks
back, which has one predictable failure: the 08:00 patrol takes the only driver
and the 16:00 patrol, which also needs one, is left with a hole.

A second pass repairs exactly that. For each hole it looks for a person already
proposed elsewhere who could fill it, and checks whether the seat they would
leave behind can be covered by someone else. Both halves must work or the swap
is undone — trading one gap for another is not an improvement. The proposal
reports how many seats were filled this way, so a reviewer can see that the
schedule was rearranged rather than merely filled.

An unfillable seat no longer abandons the rest of its crew: a patrol that
cannot find a commander still gets its driver and its לוחם.

## Not implemented

Phase 3 CP-SAT optimisation is not built, and will not be built in this
runtime: a constraint solver is a native library, and the API is Workers, where
the budget for one request is measured in milliseconds of CPU. The repair pass
above is the honest ceiling for a search that has to finish inside a request.
The plan also makes phase 3 conditional on the unit's scheduling policy being
agreed first (plan section 48), and the rule table is where that policy lives.
