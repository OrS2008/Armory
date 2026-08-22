# SHABATZAK — source plan (condensed)

This is the approved product and technical plan the implementation follows,
condensed to its decisions. Where the build deviates, the deviation is stated
here and explained in the document that owns it.

## Vision

A professional, secure, mobile-first workforce scheduling platform for a
company-sized military unit: personnel availability, assignments, shifts,
qualifications, workload, rest constraints, substitutions and daily/weekly
schedules, in one clear Hebrew interface.

The system is for **administrative personnel scheduling and task allocation**.
It must not store or optimise tactical plans, adversary information, patrol
routes, target data or weapons deployment. See `docs/10-security-model.md`
("Domain safety boundary").

## Principles

1. Fast to understand — the staffing picture in seconds.
2. Mobile first — most end users are on phones.
3. Hebrew native — RTL from day one, Israeli date format, 24-hour time.
4. Safe scheduling — risky schedules are surfaced before publication.
5. Human control — automation assists, never overrides a commander.
6. Explainability — every block or recommendation says why.

## Scope delivered in this repository

Authentication, RBAC with organisational scope, personnel, units,
qualifications, availability, assignment types, assignment instances (including
recurrence), the day/week/personnel scheduling board, manual assignment with a
ranked candidate list, the conflict engine, schedule drafts and publication with
versioning, the personal soldier view, in-app notifications, the immutable audit
log, workload reports, Hebrew RTL throughout and a responsive mobile UI.

## Deviations from the plan, and why

| Plan recommendation | Built instead | Reason |
| --- | --- | --- |
| NestJS + PostgreSQL + Prisma + Redis + BullMQ | Cloudflare Pages Functions + D1 (SQLite) | The deployment target is Cloudflare. Pages Functions is the runtime that exists there; D1 is its relational database. The module boundaries from the plan are kept as directories under `functions/api/v1` and `functions/_lib`. |
| Next.js | Vite + React SPA on Pages | No server rendering is needed for an authenticated internal tool, and a static bundle plus Functions is the simplest thing that deploys to Pages. Routing, forms, validation and server state use the libraries the plan names. |
| Tailwind + shadcn/ui | Tailwind v4 + a small in-repo component set | shadcn components are copied-in source anyway; the in-repo set is written RTL-first and carries the plan's semantic tokens. |
| WebSockets / Socket.IO for live updates | Query polling (45–60 s) plus refetch on focus | Pages Functions have no persistent socket; live sockets need Durable Objects. Tracked as post-MVP in `docs/06-backend-architecture.md`. |
| Redis + BullMQ background jobs | None yet | Nothing in the MVP needs a queue. Reminder notifications will need one (Cron Triggers or Queues). |
| MFA for privileged users | Password + session only | TOTP with recovery codes, offered to every account and not enforced. See `docs/10-security-model.md`. |
| CP-SAT / OR-Tools optimisation | Phase 1 only: ranked, explainable candidates | The plan sequences optimisation after the policy is agreed (plan section 48). |

## Definition of done for the MVP

An authorised scheduler can log in; manage personnel and units; record
availability; define assignment types; create assignments; assign personnel;
receive immediate conflict warnings; review a daily and weekly schedule; publish
a validated schedule; notify affected users; let a user see their own schedule;
review a complete audit history; and do all of it in Hebrew RTL on desktop and
mobile.
