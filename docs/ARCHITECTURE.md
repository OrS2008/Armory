# Armory v2 architecture

## Decision

Armory v2 is a new React/TypeScript/Vite application. It does not import or serve legacy frontend code. Legacy behavior is documented and reimplemented behind typed feature boundaries.

## Frontend

Feature-oriented React modules, React Router, TanStack Query, React Hook Form and Zod. Shared UI components live under `src/components`; domain code lives under `src/features`; API calls live under `src/services`; design tokens live under `src/styles`.

## Backend

Cloudflare Pages Functions expose versioned JSON APIs. Zod validates requests and responses at boundaries. D1 access uses parameterized repositories. R2 is not configured until document authorization and retention are approved.

## State and security

Server state is managed by TanStack Query. Forms use React Hook Form. Sensitive data is never persisted in localStorage/sessionStorage/IndexedDB/service-worker caches. The final encryption/session architecture is an explicit Phase 4/5 decision because it affects migration compatibility.

## Deployment

Vite builds to `dist`; Pages Functions remain in `functions`; Wrangler binds a dedicated v2 D1 database. Production identifiers are intentionally absent until provisioned.
