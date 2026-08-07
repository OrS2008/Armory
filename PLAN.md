# Armory v2 — Master Implementation Plan

## Product objective

Build Armory v2 as a new production-grade Hebrew RTL SaaS application for personnel, equipment, logistics, inventory, signatures, licenses, shortages, approvals, reporting, notifications, users, permissions, and audit operations.

The legacy application is used only to understand business requirements. The new system uses React, TypeScript, Vite, a centralized design system, typed APIs, reproducible D1 migrations, automated tests, and Cloudflare deployment.

## Global definition of done

- [~] The application is structurally new and does not depend on the old frontend.
- [~] The approved visual reference is implemented as a real design system.
- [ ] Critical business workflows are implemented.
- [ ] Desktop, tablet, and mobile experiences are complete.
- [~] RTL works correctly throughout the system.
- [ ] Authentication and authorization are enforced server-side.
- [ ] D1 migrations are reproducible.
- [-] Sensitive uploads use R2. Deferred until the document security model is approved.
- [ ] Unit, integration, and end-to-end tests pass.
- [ ] No critical or high-severity QA issues remain.
- [ ] Production deployment to Cloudflare succeeds.
- [ ] Production smoke tests pass.
- [~] Documentation accurately reflects the final system.
- [x] Implemented and unimplemented features are reported honestly.

## Phase 0 — Discovery and requirements

- [x] Inspect the complete available repository.
- [x] Inspect the available legacy application.
- [x] Map legacy screens, workflows, form fields, API endpoints, D1 entities, roles, encryption and document handling.
- [x] Identify obsolete and business-critical behavior.
- [x] Inspect the approved design reference supplied earlier in the task.
- [x] Create `docs/LEGACY-SYSTEM-AUDIT.md`.
- [x] Create `docs/PRODUCT-REQUIREMENTS.md`.
- [x] Create `docs/DATA-MIGRATION-STRATEGY.md`.
- [x] Define MVP, post-MVP, deferred scope, risks and unknowns.
- [!] Inspect `reference/legacy/Tzayad-legacy.zip` and `reference/design/armory-design-reference.png` at the requested paths. Those files are not present; the current Armory repository and previously supplied image are used instead.

## Phase 1 — Project foundation

- [~] Initialize React, TypeScript and Vite with strict TypeScript and path aliases.
- [~] Configure ESLint, Prettier, Vitest, Testing Library and Playwright.
- [~] Configure React Router, TanStack Query, React Hook Form and Zod.
- [~] Configure environment validation, Cloudflare Pages and local D1.
- [ ] Configure remote D1 and GitHub deployment after environment identifiers are known.
- [~] Add typecheck, lint, test, build and E2E scripts.
- [~] Add safe `.gitignore`, environment example, error boundary and route errors.
- [~] Add development fixtures.
- [~] Create README and development/deployment documentation.

## Phase 2 — Design system

- [~] Define centralized color, typography, spacing, radius, shadow, motion, breakpoint, focus and RTL tokens.
- [~] Build initial Button, IconButton, Input, SearchInput, Badge, StatusBadge, Avatar, Card, MetricCard, Table, Pagination, Empty/Error/Loading states and Dialog primitives.
- [ ] Complete file upload, tooltip, dropdown, drawer/sheet and component visual examples.
- [~] Add component tests and design-system documentation.

## Phase 3 — Application shell and navigation

- [~] Build desktop, tablet and mobile shells, top header, responsive navigation, page header and contextual actions.
- [~] Add skip link, document titles, offline indicator and route errors.
- [ ] Add authenticated account menu, notifications and permission-aware routes after auth API is implemented.

## Phase 4 — Authentication, users and permissions

- [ ] Define v2 session and identity strategy.
- [ ] Implement login/logout/session validation/expiration and server-side roles/permissions.
- [ ] Implement user management and authorization tests.

## Phase 5 — Database and API foundation

- [~] Draft normalized D1 schema, durable IDs, audit events, constraints and indexes.
- [~] Define typed API/error/pagination structures and Zod validation.
- [ ] Implement D1 repositories and API integration tests.
- [ ] Finalize schema only after migration dry-run against exported legacy data.

## Phase 6 — Soldiers module

- [~] Define soldier types and Zod validation.
- [~] Build list, desktop table, mobile cards, search, filters, sorting, pagination, row actions and expanded detail cards.
- [~] Build add/edit dialog foundation with React Hook Form.
- [ ] Connect create/edit/archive/restore/approval to persisted API.
- [ ] Add API, E2E and visual-regression tests using an authorized local fixture.

## Phases 7–12 — Business modules

- [ ] Equipment/signature issue and return with audit and concurrency protection.
- [ ] Inventory and shortage lifecycle.
- [ ] Licenses, R2 documents and expiration notifications.
- [~] Dashboard with real fixture-backed operational KPIs; persistence pending.
- [ ] Reports/exports and immutable audit log.

## Phases 13–18 — Quality

- [~] Verify every required desktop/tablet/mobile viewport. Current shell/soldiers screen verified at 1920, 1440, 1280, 1024, 834, 768, 430, 412, 390, 375 and 360 widths with no horizontal overflow.
- [x] Add dedicated iPhone/Android bottom navigation, iOS safe-area handling, 16px mobile inputs and 44px mobile filter targets.
- [ ] Complete WCAG 2.2 AA keyboard, screen reader, contrast and dialog review.
- [ ] Complete security, PWA and performance reviews.
- [~] Complete unit, API and Playwright E2E suites. Unit tests pass; Playwright test definitions exist but browser installation was interrupted, so E2E is not marked passing.

## Phases 19–21 — Migration, production and handoff

- [ ] Build and test legacy migration dry-run, counts, relationships, documents and rollback.
- [ ] Do not migrate production data without explicit approval.
- [ ] Verify preview/production Cloudflare configuration, migrations, deployment, smoke tests, monitoring and backups.
- [ ] Complete final documentation, changelog, screenshots and acceptance checklist.

## Required commands before each release

```bash
npm clean-install
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

No unchecked command may be reported as passing.
