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

### Removing a mark

A mark could be created from the app and edited there, and never removed — so a
typo, or a second copy of something that already existed, stayed on the list
for good. The company ended up with two marks named קצין מוצב, three people
holding one and four the other, meaning the same thing.

Every table that points at a qualification cascades from it, so a plain delete
does not merely remove a row: it strips the mark from everyone who holds it and
from every post that requires or refuses it, silently. So a delete is refused
while anything is attached, and answers with what — holders, requirements,
exclusions, and seats already recorded on shifts that were stood.

`?merge=<id>` is what a duplicate actually needs. Each move adds before it
removes and ignores what is already there, so somebody holding both marks ends
up holding the survivor once rather than failing the merge on a primary key.

The seat is the exception. A named seat is takeable once per shift, so a shift
where the survivor's seat is already filled cannot take a second: that row is
left pointing at the retired mark, and then cleared. The person stays on the
shift and stands it as the לוחם they were qualified for — the same answer
`crew-roles.yml` gives to the same question.

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
| `shift_start_minute` | Minutes past that hour — משקיף hands over at 06:30 |

— and `planStandingShifts` turns a date range plus those posts into the exact
list of shifts the period needs. It is a pure function: `POST
/api/v1/assignments/standing` decides which of them already exist and writes
only the rest, which is what makes running it twice harmless. A shift that was
deliberately cancelled counts as existing, so re-running never resurrects it.

Shifts are pinned to the wall clock, so a 16:00 handover stays at 16:00 across a
daylight-saving change; the handover either side of it is then an hour shorter
or longer, which is what happens on the ground.

### Two kinds of note on a post

A post can carry a note in two different shapes, because "the briefing is 20
minutes before whichever shift you're on" and "handover always happens at
17:00" are different facts:

| Column | Fixed or per-shift | Example |
| --- | --- | --- |
| `instructions` | Fixed: the same line under the post's title every day | "החלפה בשעה 17:00" (כיתת כוננות א׳ כרמל) |
| `briefing_minutes_before` | Per-shift: `planStandingShifts` stamps the actual time onto each shift's own `notes` when the roster is laid out, since the time moves with the shift | "תדריך עלייה לעיט בוקר בשעה 04:30" for the 05:00 shift (עיט) |

A post handed over more than once a day is briefed per turn, so the stamped note
names the turn — עיט בוקר, עיט לילה. A 24-hour post has only the one, and naming
it would say nothing.

The board reads the note off the shift, falling back to the post's
`instructions`, so a fixed rule and a computed time share one הערות column and
the day's own edit to a shift always wins.

## A post stood by a fixed crew

חפ״ק is not four seats filled from the roster. It is two rotations of four who
go on together, and a shift is one whole rotation.

That cannot be said with a qualification. A qualification is always a fact
about one person — "holds a driving licence" — and "these four, together" is a
fact about the group. So the group is a row:

| Table | What it holds |
| --- | --- |
| `assignment_type_crews` | A crew on a post: its name, and where it sits in the rotation |
| `assignment_type_crew_members` | Who is in it, and which seat they take |

A post with no crews behaves exactly as it always did. Defining crews on one
does two things at once, and both are blocking and **not overridable** —
"צוות שלם, בלי חריגות בכלל":

| Rule | What it refuses |
| --- | --- |
| `CREW_MEMBER_ONLY` | Anybody who is not in one of that post's crews |
| `CREW_NO_MIX` | A second crew on a shift the first is already standing |

Like a named seat, the real enforcement is in `verifySeat`, outside the rules
engine: a rule can be switched off in settings and a blocking one can be
overridden with a reason, and neither is what a fixed crew means. The rules
still run so that rows written before this, and the board, can show it.

### Which crew a shift *is*

The crew most of the shift belongs to, and on a tie the one that was on it
first.

The tie-break is not decoration. Ranking a candidate asks "does adding this
person break the crew", and it asks by appending them to the shift — so a crew
of one being offered somebody from the other crew is a one-all tie. Breaking
that by rotation order names the **newcomer** the standing crew and reports the
person already on the shift instead: the candidate comes back eligible, and
auto-fill cheerfully mixes the two. A test pins it.

### A long turn is not a stacked one

`MAX_CONTINUOUS` refuses a run of touching shifts longer than eight hours —
the company's "eight on, sixteen off" stated as a rule. It could not tell that
from a post whose *single* turn is twenty-four hours, so every candidate for
חפ״ק, קצין מוצב, חובש תורן or כיתת כוננות came back blocked, and auto-fill
proposed nobody at all for a post it was meant to fill.

`assignment_types.max_continuous_minutes` lets the post say its own allowance.
NULL keeps the company rule, so nothing changes for the eight-hour posts, which
is where the rule earns its keep. A run takes the largest allowance among the
shifts in it: the long turn is the reason the run is long.

### The rotations alternate on their own

Nothing schedules סבב א׳ then סבב ב׳ — the rules already there do it. חפ״ק is
handed over once a day, so the crew that has just stood twenty-four hours has
no rest at all before the next one starts, and `MIN_REST` refuses them. The
other crew is what is left. Building an alternator would have been a second
mechanism saying what the first already says.

### Editing them

The whole set is saved in one act (`PUT /assignment-types/:id/crews`). A crew
only means anything beside the others, so saving one at a time invites a moment
where somebody is in both or in neither — and while that lasts, every shift on
the post is refused. Somebody in two crews of one post is refused outright:
"which crew is this shift" would have no answer.

## The printed page

The sheet is not a packing problem. It is a fixed three-column page, read right
to left, where each post sits in the place it always sits — and the people who
use it find a post by where it is, not by reading every title. So the layout is
stored on the post rather than derived from how much height the browser has:

| Column | Meaning |
| --- | --- |
| `sheet_column` | Which of the three columns the post prints in, 1 = rightmost. `NULL` lets `sheetColumns` deal the post into the emptiest column, which is what an ad-hoc task wants |
| `priority` | Where it sits within that column, top first |
| `section` | The gate it is stood at — שער הדוקטור. A post with one is titled by its gate, and its shifts name the post instead (משקיף בוקר) |
| `sheet_label` | What the title bar prints when that differs from `name` — "קצין מוצב - 24 שעות". The name still identifies the post in dropdowns, conflicts and reports |
| `crew_role_suffix` | Appended to every seat label on this post: 'סיור' makes מפקד read מפקד סיור. It belongs to the post, not the mark — the same מפקד stands כיתת כוננות with no suffix |

Two card shapes fall out of the post itself rather than from a flag:

- A post whose crew has **named seats** — one מפקד and one נהג among the four —
  prints a role beside every name, with the הערות column merged down the block.
- A post that just needs **bodies** prints one line per turn: the clock, and
  whoever stands it, joined with `+`. A column of לוחם beside them says nothing.

A turn covering a **whole day** prints no clock at all — it is simply today — so
קצין מוצב is a title bar and a name, and כיתת כוננות is a title bar and its crew.

A narrower screen folds column three into two and then into one, which keeps the
reading order the sheet was written in.

### A named seat belongs to its mark

> "רק מי שיש לו הכשר נהג יכול להיות נהג. רק מי שיש לו הכשר מפקד יכול להיות מפקד.
> כל השאר יכולים להיות לוחמים. אין מצב שאתה בטעות מערבב לי את זה."

This is not a preference the scheduler weighs, and not a rule the settings screen
can switch off. It holds in four places, each of which could otherwise break it
on its own:

| Where | What holds it |
| --- | --- |
| The sheet | `buildCrew` seats a named seat only from the person recorded in it, or — where the caller can say who holds what — somebody qualified. A named seat with nobody qualified on the shift prints **empty**, and the people on it read לוחם |
| Auto-fill | A named seat draws only from holders, and never spends one on a plain seat while somebody unmarked can stand it |
| The assign dialog | Choosing נהג narrows the candidate list to the drivers, and says so |
| The API | `assign` and `bulk-assign` refuse a seat the person does not hold — **422, before anything is written**, outside the rules engine, and an `overrideReason` in the request is ignored rather than honoured |

The `ROLE_QUALIFICATION` rule still runs, because rows written before the API
enforced this are still in the table and the sheet has to show them. It is
blocking and no longer overridable: there is nothing left for an override to
mean. `.github/workflows/crew-roles.yml` lists those rows against production and,
when told to, corrects them — by clearing the seat, never by removing anybody:
the shift stays, and the person stands it as the לוחם they were qualified for.

### Naming the turns

A turn is named by its place in the post's own day rather than by the clock —
בוקר, צהריים, ערב down the card — so the same turn reads the same on two posts
that do the same job an hour and a half apart, and a post that hands over before
dawn does not lead with לילה. A rhythm nobody says out loud, like ש״ג every four
hours, has no such names and prints as a plain list of times.

The day a turn belongs to is the day it *starts*: 21:00–05:00 is the evening
turn of the day it begins, not the first line of the next morning's sheet. The
timeline views want the opposite — everything in progress at a given hour — and
so pass no day at all.

### Arranging it by hand

Both kinds of arrangement are made by dragging, on a phone as well as a desktop:
pointer events rather than HTML5 drag-and-drop, which does not exist on touch. A
press becomes a drag only once it has travelled, because a title bar is also the
button that opens the post.

- **A card** to another column or another place in one. `moveSheetCard` resolves
  the drop against the page as drawn and returns the page in full, which is why
  it is undoable: the caller keeps the placements it had and puts them back.
  `PUT /api/v1/assignment-types/layout` writes them in one batch — a page
  written a post at a time is a page that can be half written.
- **A person** to another seat. Whoever is already there takes the seat being
  vacated, so a drop onto a filled seat trades the two. A seat is addressed by
  its place in the crew, not by the role it carries: two plain לוחם seats carry
  the same role, and who sits in the מפקד seat is decided by `buildCrew` rather
  than stored. Moving between two plain seats of one crew is refused before
  anything is written, because the roster cannot express it and the move would
  quietly undo itself on the next read.

A move is two acts — a seat is taken once, so whoever is in the target stands up
before anybody sits down. If the second half is refused, everyone is put back:
a half-finished swap is worse than a refused one.

The gesture differs by what is doing it, because a finger has only one gesture
and the page needs it. A mouse moving with the button down can only be dragging,
so a few pixels start it. A finger moving means scrolling — which is what most
of the sheet is for — so touch waits for a press and hold, and any movement
before that hands the gesture back to the page. Marking the handles
`touch-action: none` was the first attempt and the wrong one: on a phone the
sheet is made of those title bars and those names, so it stopped the page being
scrolled at all.

## Removing what is no longer needed

Three different acts, and calling them all "delete" is how a roster loses the
record of a day that happened:

| What | Happens | Why |
| --- | --- | --- |
| A shift still ahead of us that nobody is on | Deleted | It records nothing. Cancelling would leave a tombstone that also blocks the post from ever being laid out over that slot again |
| A shift somebody stood or is standing | Cancelled | Who was at the gate on Tuesday is a question the sheet has to keep answering. It counts as existing, so laying the period out again never resurrects it |
| A post nobody needs | Deleted, with every shift it was stood on | Refused unless asked for in those words (`?shifts=delete`), and the confirmation says how many go with it. Retiring it instead keeps every one of them readable |

The board offers the first two under one action, because from the reader's side
they are the same intent — take this off the sheet — and which one applies is a
fact about the shift rather than a decision to make. The result says which
happened.

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

### Who is not filler

A מפקד and a נהג are scarce in a way a לוחם is not: one of each is what makes a
crew a crew, and there are only so many of them. A crew of four needing one of
each has two plain seats left, and filling those with the other commanders and
drivers empties the bench the next crew's named seats draw from — the shortage
then shows up the following morning, on a different post.

So auto-fill offers a plain seat to people holding none of the marks that name a
seat anywhere on the board, and reaches for a marked one only when the seat
would otherwise stand empty. Holding them back only helps while there is
somebody to hold them back for; a seat left empty to protect a bench nobody will
draw from is a shortage the sheet invented.

Candidate ranking knows about open seats: someone holding a qualification the
crew is still short of gains 25 points and a reason saying so, which lifts them
above an equally rested peer who would leave the gap open.

### An approved replacement is a scheduling decision

A replacement used to be written unchecked: the approval swapped the two people
in one batch and asked nothing. That let an approval do what the board would
have refused — double-book the person coming in, spend the rest they were owed,
or drop them into a מפקד seat they do not hold — and it dropped the seat's mark
on the way, so a driver was replaced by a nobody and the post quietly lost its
driver.

`functions/_lib/seat.ts` now answers the one question all of these ask: *would
seating this person here break anything?* It simulates the placement — with the
outgoing person standing up, where somebody is standing up — re-runs the engine
over the window, and returns the conflicts for that person on that assignment,
plus the seat refusal that stands outside the engine. `assign` and the
replacement approval both go through it, so they cannot drift into disagreeing
about the same person on the same shift.

The seat's mark travels with the seat: whoever comes in inherits the
`role_qualification_id` the outgoing person stood in, and is refused if they do
not hold it.

### Finding your own cover

Asking for cover used to be one tap that filed a bare request and left the
soldier with nothing to do but wait, so the arrangement went on happening in
the group chat — where nothing checks it, nothing records it, and the person
doing the asking has no way of knowing who is even free.

Three things move it here, and each is something a chat cannot do:

| | |
| --- | --- |
| `GET /me/cover` | Who could actually stand this shift, ranked by the same engine the scheduler's list uses — but **names only**. The scores, the workload and the reasons behind them are the scheduler's to read, not a peer's. The shift is ranked as it would be *without* the requester, or the seat they are vacating never looks open |
| `POST /replacements` with a stand-in | Checked before the request is filed rather than at approval, so nobody spends an evening arranging cover the roster was never going to take. A named seat's mark applies here as everywhere |
| `POST /replacements/:id/respond` | The stand-in's own answer, authorised by **identity rather than permission**: an administrator holds every permission there is and still may not answer for somebody else |

Neither answer decides anything. Agreeing hands a settled arrangement to
whoever approves it — and the approval itself still goes through the gate above.
Declining returns the request to the pile rather than closing it: the person who
asked still needs cover, and a declined request that ended would leave them
looking at an answered row while nobody stands their shift.

A commander may still approve a stand-in who has not answered — ordering
somebody onto a shift is a thing a commander does. The screen says which it is,
because ordering and accepting an arrangement are different acts.

### Putting your name down for an open seat

A shift short of people is a hole the commander is trying to fill; somebody
free who would take it is the answer. The two used to live in different places
— the hole on the board, the offer in a chat nobody reads twice — so the offer
was made late or not at all.

`GET /me/open-seats` closes that. It looks a week ahead, takes the nearest
sixty understaffed shifts, and for each asks which of its open seats this
person could stand — the same `verifySeat` that would refuse the assignment.
Offering somebody a shift the roster would then refuse is worse than offering
nothing.

The cost is the reason for the shape. Whether somebody may take a seat depends
on **their own shifts and the seat**, and on nothing else, so each check is
handed those rather than the whole window — the same fact the auto-fill budget
turns on. Without it, examining sixty shifts means running the engine over the
fortnight sixty times, which is not a thing a request may spend.

An offer is not an assignment: the commander still decides who stands where.
Accepting one goes through the gate again rather than trusting the check made
when the offer was filed, because a week can pass in between and what was true
then need not be now.

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

### Is the load actually spread evenly?

The workload table sorts by hours, which reads as a leaderboard and answers
"how much has each person done". The question a commander opens it with is the
other one — *is anyone carrying the company, and is anyone being missed* — and
that needs a middle to measure against.

`summarizeBalance` supplies it, against the **median** rather than the mean: one
person on a fortnight of nights drags a mean far enough that half the company
reads as under-loaded, and that person existing is the reason the number is
being looked at. It reports the median, each person's signed distance from it,
the spread between the ends, and the share of the load held by the heaviest
fifth — even is 20%, and past about a third the roster is leaning rather than
merely uneven.

Nights and weekends are measurable in their own right, because that is where an
uneven roster is felt first and a total hides them.

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

### What it costs

Auto-fill runs in the browser, on the phone of whoever is on duty, and nothing
moves on screen while it does — so how long it takes is part of the feature.
Two facts keep it in reach for a whole day of the company's posts:

- **Ranking asks about one person.** The conflicts that decide whether somebody
  may take a seat — a rest gap, a double booking, a day's worth of turns —
  depend on *their* shifts and the seat, and on nothing else. So the engine is
  handed those, not the whole day; the crew-level conflicts it would also find
  are about the assignment rather than the person, and ranking discards them.
- **The repair pass asks about one person too.** A hole is empty because nobody
  was eligible for it, and every decision taken since has only added shifts,
  which never makes anyone *more* eligible. So releasing a donor can only make
  that donor available: there is no one else to rank.

`shared/__tests__/autofill-day.test.ts` fills a real day and holds the result
to a budget, because the first version of the sheet's new posts pushed it to
nine seconds and the end-to-end suite started timing out on the button.

## Not implemented

Phase 3 CP-SAT optimisation is not built, and will not be built in this
runtime: a constraint solver is a native library, and the API is Workers, where
the budget for one request is measured in milliseconds of CPU. The repair pass
above is the honest ceiling for a search that has to finish inside a request.
The plan also makes phase 3 conditional on the unit's scheduling policy being
agreed first (plan section 48), and the rule table is where that policy lives.
