# Screen specifications

Every screen defines loading, empty, error, permission-denied and success
states. Unless noted, `QueryState` supplies the first four.

| Route | Screen | Who sees it |
| --- | --- | --- |
| `/login` | Login — username or email, plus password | Everyone |
| `/dashboard` | Control board | Any signed-in user |
| `/schedule` | Scheduling board — day, week, personnel | `assignments.read` |
| `/schedule/conflicts` | Conflicts | `assignments.read` |
| `/personnel` | Roster | `personnel.read` |
| `/availability` | Availability | `availability.read`, or own rows |
| `/assignment-types` | Assignment types | `assignment_types.read` |
| `/replacements` | Replacement requests | Any signed-in user; scope decides the rows |
| `/notifications` | Notifications | Any signed-in user |
| `/reports` | Reports | `reports.read` |
| `/settings` | Rules, units, qualifications, audit | `rules.read` and per-tab |
| `/me` | My schedule | Users linked to a personnel record |

## `/dashboard` — לוח בקרה

Answers the plan's six questions at a glance: available, assigned, issues,
unpublished, upcoming assignments, recent changes.

- Four metric tiles: available (of total), assigned today (with unavailable
  count), issues (blocking + warning), unpublished (with understaffed count).
- **Upcoming assignments** — each row shows staffing as `assigned/required`, or a
  warning badge naming how many people are missing.
- **Scheduling alerts** — the first eight conflicts with severity and full text.
- **Recent changes** — the last eight audit entries, for users who may read them.
- Refreshes every 60 seconds.

## `/schedule` — שבצ״ק

The core workspace.

- Date navigator (previous / next / today, weekday name), three view tabs, unit
  filter, schedule selector, conflicts link with a live count.
- **Day view** — rows are assignments, columns are time; the day runs
  right-to-left. Blocks are coloured by state and conflict severity; overnight
  work is clipped at midnight and marked. A DST day draws 23 or 25 hours.
- **Week view** — seven day columns; clicking a day header opens it in day view.
- **Personnel view** — one row per person, showing who is free.
- Opening a block gives assignees (with remove), this assignment's conflicts, and
  the ranked candidate list.
- **New assignment** — type (which prefills duration and headcount), date, start
  and end time with an explicit "next day" flag for overnight shifts, unit,
  headcount, recurrence (none / daily / chosen weekdays, until a date) and notes.
- **Publish** — confirmation, then validation; blocking conflicts refuse and are
  listed, warnings do not.

## `/schedule/conflicts` — התנגשויות

Fourteen days ahead, filtered by severity with counts on each tab. Every entry
gives what happened, who is affected, and how to resolve it.

## `/personnel` — כוח אדם

Search by name, service number or role; filter by unit and qualification. Table
shows name and service number, unit, role, up to three qualification badges,
status and actions. Create and edit use the same dialog; archiving asks for
confirmation and preserves history.

## `/availability` — זמינות

Filter by status. Table shows person, kind, from, to, status, and approve/reject
for anyone holding `availability.approve`. A soldier's entry is created as
pending; a scheduler's is approved immediately. The person selector is locked for
soldiers, who may only submit their own.

## `/settings` — הגדרות

- **Rules** — every rule with its numeric configuration, severity, enabled and
  overridable flags. Editable only with `rules.write`; changes take effect on the
  next evaluation and are audited.
- **Units** — the hierarchy as an indented tree, with an add dialog.
- **Qualifications** — code, name, status, add dialog.
- **Audit** — the latest 150 events with the notice that records cannot be
  edited or deleted.

## `/me` — השבצ״ק שלי

The soldier's screen. Upcoming assignments with weekday, full time range,
acknowledgement, and a replacement request; own availability with status. Draft
assignments never appear here.

## Mobile

Bottom navigation (my schedule, dashboard, board, personnel, notifications) with
≥ 56 px targets; the sidebar becomes an off-canvas drawer that is fully inert
when closed. Tables and timelines scroll inside their own containers.
