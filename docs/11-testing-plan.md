# Testing plan

```bash
npm run typecheck   # tsc across app, shared and functions
npm run lint        # eslint, type-aware, zero warnings tolerated
npm run format      # prettier check
npm test            # vitest — unit and component
npm run test:e2e    # playwright — full stack
```

## What is covered today

75 unit and component tests, 11 end-to-end tests across two viewports.

### Unit — `shared/__tests__`

| File | Focus |
| --- | --- |
| `time.test.ts` | Wall-clock ↔ UTC conversion, DST (23- and 25-hour days), half-open intervals, day keys, night and weekend detection |
| `conflicts.test.ts` | Every rule, severity configuration, overrides, cancelled assignments, the summary |
| `candidates.test.ts` | Workload-based ordering, explanations, ineligibility, eligible-first ranking |
| `fairness.test.ts` | Total / night / weekend hours, window clipping, weighting, rest calculation |
| `rbac.test.ts` | Role permissions per the matrix, scope inheritance and exclusion |
| `recurrence.test.ts` | Daily and weekday recurrence, overnight shifts, wall-clock stability across DST |

### Component — `src/**/__tests__`

| File | Focus |
| --- | --- |
| `ConflictList.test.tsx` | Conflicts show cause, subject and resolution; severity is labelled in text, not colour alone |
| `timeline.test.ts` | Block geometry, midnight clipping, tick count on a DST day |
| `schemas.test.ts` | Hebrew validation messages, ordering constraints, empty-select handling |

### End-to-end — `tests/e2e`

Playwright starts a real server: `npm run build` plus `wrangler pages dev`,
backed by local D1. `global-setup.ts` re-applies migrations, reloads demo data
and clears users so the bootstrap path runs each time.

| Spec | Scenario |
| --- | --- |
| `auth.spec.ts` | RTL and `lang="he"`, wrong credentials produce a Hebrew alert, unauthenticated redirect, successful login |
| `scheduling.spec.ts` | Add a person; create an assignment and see it reported as understaffed; assign from the ranked candidate list |
| `navigation.spec.ts` | Mobile bottom navigation, empty states, the audit screen's immutability notice, the rules screen |

Both projects (`desktop` 1440×900 and `mobile` Pixel 7) run the whole suite. In
a sandbox with a preinstalled browser, set `PLAYWRIGHT_CHROMIUM_PATH`.

## Two bugs the suite has already caught

Worth recording, because they are the reason the tests exist:

1. The closed mobile navigation drawer was translated off screen but still
   intercepted taps, making the board unusable on a phone. Found by the mobile
   project, fixed in `AppShell`.
2. An unselected `<select>` submits `""`, which the id schema rejected — saving
   a person without a unit failed with a validation error. Fixed in
   `shared/schemas.ts` and covered by a regression test.

A third came from the schema itself: the append-only trigger refused to delete a
user, because the audit table's foreign key would have cascaded an UPDATE. The
fix was to drop that foreign key so audit rows outlive accounts.

## Gaps

- **No API integration tests.** The handlers are covered only through E2E.
  `wrangler pages dev` plus `supertest`-style HTTP assertions would close this;
  the workflows were verified manually during development.
- **No accessibility assertions.** `@axe-core/playwright` should be added.
- **No load or performance testing** against the plan's p95 targets.
- **No visual regression testing.**
- The E2E suite runs serially with one worker, because it shares one local
  database.
