# API specification

Base path `/api/v1`. Cloudflare Pages Functions, file-routed under `functions/`.

## Envelope

Success:

```json
{ "ok": true, "data": { … } }
```

Failure:

```json
{ "ok": false, "error": { "code": "SCHEDULING_CONFLICT", "message": "…", "details": { … } } }
```

The code is the contract; the message is Hebrew and ready to display. Codes are
listed in `shared/errors.ts`, messages in `shared/messages.he.ts`.

| Status | Codes |
| --- | --- |
| 401 | `AUTH_REQUIRED`, `SESSION_EXPIRED` |
| 403 | `FORBIDDEN`, `OUT_OF_SCOPE`, `OVERRIDE_NOT_ALLOWED` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT`, `ALREADY_ASSIGNED`, `SCHEDULING_CONFLICT`, `SCHEDULE_NOT_PUBLISHABLE` |
| 415 | `JSON_REQUIRED` |
| 422 | `VALIDATION_FAILED` — `details.fields` maps field name to a Hebrew message |
| 429 | `RATE_LIMITED` |
| 503 | `NOT_CONFIGURED`, `SCHEMA_NOT_READY` |

## Endpoints

### Authentication

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| POST | `/auth/login` | — | Sets the session cookie. First-run bootstrap creates the initial administrator |
| POST | `/auth/logout` | session | Revokes the session and clears the cookie |
| GET | `/auth/me` | session | Current user, role, scope and permissions |
| GET | `/health` | — | Readiness probe; reports `database` and `schema` separately |

### Organisation

| Method | Path | Permission |
| --- | --- | --- |
| GET / POST | `/units` | `units.read` / `units.write` |
| PATCH | `/units/:id` | `units.write` |
| GET / POST | `/qualifications` | `qualifications.read` / `qualifications.write` |
| PATCH | `/qualifications/:id` | `qualifications.write` |

### Personnel

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/personnel` | `personnel.read` | Filters: `q`, `unitId`, `status`, `qualificationId`, `includeInactive` |
| POST | `/personnel` | `personnel.write` | |
| GET / PATCH | `/personnel/:id` | `personnel.read` / `personnel.write` | Scope-checked |
| DELETE | `/personnel/:id` | `personnel.write` | Archives; never deletes |

### Availability

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/availability` | `availability.read`, or own rows | Filters: `from`, `to`, `personnelId`, `status` |
| POST | `/availability` | `availability.write`, or own request | A soldier's entry starts as `pending` |
| PATCH | `/availability/:id` | `availability.approve` | Approve or reject; notifies the person |
| DELETE | `/availability/:id` | `availability.write`, or own pending row | |

### Assignments

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/assignments` | `assignments.read` | `from`, `to`, `unitId`, `scheduleId`; returns assignments **and** the window's conflicts |
| POST | `/assignments` | `assignments.write` | Optional `recurrence`; returns created ids and the conflicts they introduce |
| GET / PATCH | `/assignments/:id` | `assignments.read` / `assignments.write` | Editing a published assignment sets `publication_state = modified` |
| DELETE | `/assignments/:id` | `assignments.write` | Cancels |
| POST | `/assignments/:id/assign` | `assignments.assign` | 409 on a blocking conflict unless a permitted `overrideReason` is supplied |
| POST | `/assignments/:id/unassign` | `assignments.assign` | `scope: "day"` removes the person from every shift starting that local day |
| POST | `/assignments/unassign-day` | `assignments.assign` | The group version of the row above: clears everyone off every shift starting on `day`; the shifts stay |
| POST | `/assignments/standing` | `assignments.write` | Lays out every standing post across `fromDate`–`toDate`; idempotent, and answers `{created, skipped, posts}` |
| GET | `/assignments/:id/candidates` | `assignments.assign` | Ranked, explained candidates |
| POST | `/assignments/:id/acknowledge` | session + linked personnel | Soldier confirms their own assignment |
| GET / POST | `/assignment-types` | `assignment_types.read` / `.write` | |
| PATCH | `/assignment-types/:id` | `assignment_types.write` | |

### Schedules

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET / POST | `/schedules` | `schedules.read` / `schedules.write` | |
| GET | `/schedules/:id` | `schedules.read` | Schedule, assignments, conflicts, version history |
| POST | `/schedules/:id/validate` | `schedules.read` | Dry run: `publishable`, summary, conflicts |
| POST | `/schedules/:id/publish` | `schedules.publish` | Atomic; refuses while a blocking conflict remains |

### Everything else

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET | `/dashboard` | session | Today's counts, upcoming assignments, conflicts, recent changes |
| GET | `/conflicts` | `assignments.read` | `from`, `to`, `severity` |
| GET | `/me/schedule` | session | Own assignments and availability; drafts withheld |
| GET / POST / DELETE | `/me/calendar` | session | Whether a calendar link exists / issue one (returned once) / revoke |
| GET | `/calendar/:token.ics` | **none** | One person's duty times as iCalendar; the token is the whole credential |
| GET | `/notifications` | session | With `unreadCount` |
| POST | `/notifications/read` | session | `?id=` for one, omitted for all |
| GET / POST | `/replacements` | see matrix | |
| PATCH | `/replacements/:id` | `replacements.decide` | Approval swaps the two people in one batch, through the same gate as an assignment |
| GET | `/rules` | `rules.read` | |
| PATCH | `/rules/:code` | `rules.write` | Merges `config`, updates severity, enabled, overridable |
| GET | `/reports/workload` | `reports.read` | Per-person workload and staffing gaps |
| GET | `/audit` | `audit.read` | Filters: `entityType`, `entityId`, `action`, `from`, `to`, `limit` |

## Conventions every mutating handler follows

1. `checkOrigin` — cross-site requests are rejected.
2. `requireUser(request, env, permission)` — authenticate, then authorise.
3. `readBody(request, schema)` — Zod validation, 422 with field messages.
4. `requireScope` — organisational scope, on both current and target unit.
5. Multi-row changes go through `env.DB.batch`, which D1 runs as a transaction.
6. An audit event is written for every meaningful change.

## Not implemented

No OpenAPI document is generated yet; this file is the specification. Export is a client concern: the reports screen builds CSV and a real .xlsx
workbook in the browser from data it already holds, and PDF is the browser's
own print dialog over a print stylesheet. No endpoint renders a document. `POST /personnel/import` and `POST /availability/import` both
take parsed CSV rows and both default to a dry run.
