# Armory v2 product requirements

## Objective

A commercial-quality Hebrew RTL operations platform for personnel, equipment, inventory, licences, documents, shortages, approvals, reports, notifications, permissions and audit.

## MVP

- Secure authentication and server-enforced RBAC.
- Operational dashboard using real data only.
- Soldiers: list/search/filter/sort/pagination, detail, create/edit/archive/restore and approval.
- Equipment catalog, issue, partial/full return and immutable audit event.
- Civilian/military licences with expiry states.
- Shortage queue and resolution lifecycle.
- Responsive desktop/tablet/mobile UI, accessible dialogs/forms and explicit data states.
- Reproducible D1 migrations, typed API contracts and automated tests.

## Post-MVP

Inventory adjustments, armoury, ammunition, vehicles/fuel, notifications center, advanced reports, R2 documents and migration tooling.

## Deferred pending decisions

- R2 storage and access policy.
- Final identity provider versus password-based sessions.
- Whether browser-side legacy encryption remains the v2 primary model.
- Production database/project identifiers and deployment authorization.

## Core terminology

`חיילים`, `ציוד`, `הנפקה`, `החזרה/זיכוי`, `מלאי`, `בקשת חוסר`, `רישיון אזרחי`, `רישיון צבאי`, `ממתין לאישור`, `מאושר`, `בארכיון`, `יומן ביקורת`.

## Non-functional requirements

- RTL-first, WCAG 2.2 AA practical target and keyboard operation.
- No page-level horizontal overflow at required breakpoints.
- Server-side authorization; client hiding is never sufficient.
- No sensitive data in logs, browser persistence or static caches.
- Stable typed errors, bounded pagination, parameterized SQL and safe uploads.
- Cloudflare Pages/Functions, D1 and GitHub deployment compatibility.
