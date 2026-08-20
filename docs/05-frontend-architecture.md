# Frontend architecture

Vite + React 19 + TypeScript, a single-page app served by Cloudflare Pages.

```
src/
├── app/            providers, router, shell layout
├── components/
│   ├── ui/         design-system primitives
│   ├── layout/     shell pieces (navigation, page header, offline banner)
│   ├── scheduling/ timeline, week grid, conflict list
│   └── feedback/   error boundary
├── features/       one folder per screen area
├── hooks/          auth context, TanStack Query hooks
├── i18n/           Hebrew dictionary and t()
├── lib/            API client, date helpers, class names
├── styles/         design tokens
└── test/           vitest setup
```

`shared/` (a sibling of `src/`, aliased as `@shared`) holds the domain: types,
Zod schemas, the conflict engine, fairness, recurrence, RBAC, time and the
Hebrew domain messages. The API imports the same files by relative path, so a
rule change lands on both sides at once.

## State

| Kind | Tool |
| --- | --- |
| Server state | TanStack Query — all fetching lives in `hooks/queries.ts` |
| Session | `AuthProvider` over a `/auth/me` query |
| Local UI state | `useState` in the owning component |
| Forms | React Hook Form + Zod via `@hookform/resolvers` |

There is no global store. Board filters and the selected day are component
state; a query key change refetches. `useScheduleInvalidation` invalidates every
schedule-dependent key after a write, so the board, the dashboard, the conflicts
screen and the personal view cannot disagree.

Live updates use polling — assignments every 45 s, dashboard and notifications
every 60 s, plus refetch on window focus. The plan asks for WebSockets; Pages
Functions cannot hold a socket without Durable Objects (see
`docs/06-backend-architecture.md`).

## Data flow for an assignment

```
ScheduleBoardPage
  └─ useAssignments({ from, to, unitId })      GET /assignments → assignments + conflicts
       ├─ DayTimeline / WeekGrid / PersonnelTimeline   render blocks and warnings
       └─ AssignmentDetailDialog
            ├─ GET /assignments/:id/candidates          ranked suggestions
            └─ useAssignPersonnel()                     POST …/assign
                 ├─ 200 → invalidate, toast
                 └─ 409 SCHEDULING_CONFLICT → show the conflict, offer an override
```

## Hebrew and RTL

- `<html lang="he" dir="rtl">`; the whole tree inherits it.
- Every visible string comes from `src/i18n/he.ts` through `t('key')`. Domain
  strings the server produces come from `shared/messages.he.ts`.
- Layout uses logical properties throughout — `ms-*`, `me-*`, `ps-*`, `pe-*`,
  `start-*`, `end-*`, `inset-inline-start` — so nothing is pinned to a physical
  side. Timeline blocks are positioned with `insetInlineStart`, which makes the
  day run right-to-left without a second code path.
- Numbers, times, service numbers and identifiers are wrapped in `.ltr-inline`
  (`direction: ltr; unicode-bidi: isolate`) so they read correctly inside Hebrew
  sentences.
- Dates are `DD/MM/YYYY`, times 24-hour, from `shared/format.ts`.
- Navigation chevrons are mirrored: "previous day" points right.

## Accessibility

- One `<h1>` per screen, landmarks for header, navigation and main, and a skip
  link.
- `Field` wires label, control, hint and error with `aria-describedby`,
  `aria-invalid` and `aria-required`. The required `*` is `aria-hidden`, so the
  accessible name stays the label text.
- Icon-only controls take a mandatory `label` prop.
- Severity is always shown as text as well as colour.
- The dialog is a native `<dialog>` with `showModal()`, giving the top layer,
  Esc and a focus trap without a library.
- Toasts render in an `aria-live="polite"` region.
- `prefers-reduced-motion` is respected globally.

## Responsive

| Breakpoint | Layout |
| --- | --- |
| < 1024 px | Off-canvas drawer plus a bottom navigation bar with ≥ 56 px targets |
| ≥ 1024 px | Sticky sidebar on the inline-end side, wide workspace |

Wide content (timelines, tables) scrolls inside its own container; the page body
never scrolls sideways.

## Screen states

`QueryState` renders loading, error, permission-denied and empty consistently.
`OfflineBanner` says plainly when the browser is offline and when data was last
current, so nothing stale is mistaken for live.

## Not implemented

Command palette (Ctrl/⌘-K), global search, keyboard shortcuts, drag-and-drop on
the board, undo/redo and PWA offline caching. All are post-MVP in the plan; the
board currently assigns through the candidate dialog rather than by dragging.
