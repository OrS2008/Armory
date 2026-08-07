# Legacy system audit

## Sources inspected

The available legacy source is `/Users/ors/Documents/New project/Armory`. The requested `reference/legacy/Tzayad-legacy.zip` is not present. The approved image supplied earlier in the conversation is used as the visual reference; the requested repository-local image is not present.

## Legacy architecture

The legacy application is a no-build Hebrew RTL Cloudflare Pages application. A single 5,700-line `public/app.js` combines cryptography, state, validation, rendering and events. One catch-all Pages Function handles the API. D1 stores ciphertext envelopes, statuses, users, sessions and throttling. A large stylesheet contains multiple historical theme layers.

## Screens and workflows

- Public home/action chooser.
- Soldier registration: identity, department, phone, serials, civilian/military licences, documents, equipment selection, confirmation and submission.
- Shortage request, armoury deposit and building-fault submission.
- Admin setup/login/logout/lock/password rotation.
- Dashboard, pending approval, soldier/equipment tracking, shortages, faults, inventory, armoury, Tzelem, ammunition, vehicles/fuel, reports, users and permissions.
- Approval, bulk approval/delete, quantity adjustment, partial/full return, WhatsApp messages, exports, printing and encrypted document reveal.

## Entities

Soldier equipment records, reports, documents, encrypted vault inventory, users, sessions, throttle records, equipment catalog, departments, licences, armoury items, ammunition, vehicles, fuel cards, receipts and operational logs.

## Roles and permissions

Admin has write and user-management access. Viewer is GET-only on the server and additionally scoped to permitted tabs/data sources. Public users can submit encrypted envelopes but cannot decrypt records.

## Security behavior to preserve or redesign explicitly

- Browser-side envelope encryption; plaintext and private keys remain in memory only.
- Strict decrypted-payload normalization and output escaping.
- Parameterized D1 queries, security headers, throttling and expiring sessions.
- Authenticated APIs are never service-worker cached.
- Uploaded images are encrypted blobs in D1. V2 should evaluate R2 with authenticated access rather than silently changing storage.

## Feature disposition

| Legacy capability                      | V2 disposition                                              |
| -------------------------------------- | ----------------------------------------------------------- |
| Public soldier registration            | Redesign and migrate                                        |
| Soldier list/expanded details          | Replace frontend; preserve workflow                         |
| Approval and equipment returns         | Redesign with transaction/audit model                       |
| Inventory/vault aggregate blob         | Replace with normalized entities after migration design     |
| Shortage/fault/deposit reports         | Migrate as typed workflows                                  |
| Users/viewer tab scopes                | Replace with normalized RBAC permissions                    |
| Browser encryption                     | Preserve until a reviewed v2 threat model authorizes change |
| Native prompt/confirm operations       | Replace with accessible dialogs                             |
| Client-only pagination over ciphertext | Re-evaluate against encryption/search requirements          |
| Historical CSS/frontend                | Retire                                                      |

## Critical risks

Changing the encryption/search architecture can make legacy data unreadable or weaken confidentiality. The new schema must not be deployed over the legacy D1 database. Migration requires explicit backup, dry-run, record-count reconciliation and rollback approval.
