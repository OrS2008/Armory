# Design system

Tailwind v4 with tokens defined in `src/styles/index.css`. Business meaning is
carried by semantic tokens; a component never invents a colour.

## Tokens

| Group | Tokens |
| --- | --- |
| Surfaces | `surface`, `surface-raised`, `surface-sunken` |
| Borders | `border-subtle`, `border-strong` |
| Text | `ink`, `ink-muted`, `ink-faint`, `ink-inverse` |
| Brand | `brand-50/100/200/500/600/700` |
| Status | `success`, `warning`, `danger`, `info` and their `-soft` fills |
| Scheduling states | `state-unavailable`, `state-draft`, `state-published` |
| Shape | `radius-card`, `radius-control` |
| Elevation | `shadow-card`, `shadow-popover` |

Colours are authored in `oklch` for even perceptual steps. Semantic pairs
(`danger` on `danger-soft`) are chosen to clear WCAG AA for body text.

## Typography

A system Hebrew stack — Segoe UI, Noto Sans Hebrew, Arial Hebrew, then
`system-ui`. No webfont is loaded: the CSP forbids external origins, and a
self-hosted Hebrew face would add ~100 KB for a marginal gain. `body` sets
`unicode-bidi: plaintext` so mixed Hebrew/English paragraphs order correctly.

## Components

| Component | Notes |
| --- | --- |
| `Button` / `buttonClass` | Four variants, three sizes, built-in loading state. `buttonClass` shares the appearance with router links |
| `IconButton` | `label` is required — icon-only controls always announce themselves |
| `Field` | Label, control, hint and error wiring; render-prop passes `id`, `describedBy`, `invalid`, `required` |
| `Input` / `Select` / `Textarea` | One shared visual base, `aria-invalid` styling |
| `Badge` | Tones from `badge-tones.ts`; `severityTone` maps conflict severity to a fixed tone |
| `Card` / `CardHeader` / `MetricCard` | Panels and dashboard tiles |
| `Dialog` | Native `<dialog>` + `showModal()`: top layer, Esc, focus trap, backdrop click |
| `TableWrapper` / `Th` / `Td` | Tables scroll inside their own container |
| `QueryState` | Loading, error, permission-denied and empty in one place |
| `ToastProvider` | `aria-live` region, auto-dismiss |

Scheduling components — `DayTimeline`, `WeekGrid`, `PersonnelTimeline`,
`AssignmentBlock`, `ConflictList` — share the geometry helpers in
`components/scheduling/timeline.ts`.

## Status colour, and never colour alone

| State | Tone | Also conveyed by |
| --- | --- | --- |
| Published | success | Badge text "פורסם" |
| Draft | neutral | Badge text "טיוטה" |
| Modified after publication | warning | Badge text "שונה לאחר פרסום" |
| Blocking conflict | danger | Badge text "חוסם", full sentence |
| Warning | warning | Badge text "אזהרה" |
| Understaffed | warning | "חסר אדם אחד" / "חסר N אנשים" plus a count badge |

## RTL

The system is RTL-native rather than mirrored after the fact: logical properties
everywhere, `insetInlineStart` for timeline geometry, mirrored navigation
chevrons, and `.ltr-inline` for numerals inside Hebrew text.

## Breakpoints

`xs` 26 rem, `sm` 40 rem, `md` 48 rem, `lg` 64 rem, `xl` 80 rem — matching the
plan's mobile (375–480), tablet (768–1024), desktop (1280+) and command-display
(1600+) targets.

## Not implemented

Dark mode (tokens are structured for it, but no dark palette is defined),
tooltips, dropdown menus, a drawer/sheet primitive, file upload, and a component
gallery page.
