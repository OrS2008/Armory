# Getting the roster into SHABATZAK

## The equipment system cannot be read server-side

The live equipment system is the D1 database `tzayad`. Everything personal in
it is encrypted at rest:

| table         | what it holds                                                  |
| ------------- | -------------------------------------------------------------- |
| `records`     | `ek`, `iv`, `ct` — the soldier's details as ciphertext, under an `rid` derived from the personal number |
| `docs`        | `ek`, `iv`, `ct` |
| `reports`     | `ek`, `iv`, `ct` |
| `vault`, `vault_parts` | `ek`, `iv`, `ct` |
| `serial_tags` | `tag` — PBKDF2 of the number, not reversible |
| `users`       | login accounts: username, role, salt, verifier, wrapped key — no roster |

The key that opens `ct` is wrapped under a user's password and is only
unwrapped in that user's browser after they sign in. So there is no query that
returns a name, and `.github/workflows/import-from-equipment.yml` now says so
rather than failing on `no such table: soldiers`. That workflow still works
against a source that stores the roster in plaintext (`soldiers`,
`departments`, `licenses`) — the schema the earlier in-repo Armory app used.

## What to do instead

Export the roster from the equipment application while signed in — that is
where the data can be decrypted — and load the file through
**כוח אדם → ייבוא מקובץ**.

Only a name column is required. Recognised headers:

| field         | accepted headers |
| ------------- | ---------------- |
| name          | שם, שם מלא, שם החייל, name, full name |
| personal no.  | מספר אישי, מ״א, מא, מספר, id, personal id |
| unit          | מסגרת, מחלקה, צוות, פלוגה, unit, team, platoon |
| role          | תפקיד, role, title |
| phone         | טלפון, נייד, phone, mobile |
| qualifications| הכשירים, הכשיר, כשירויות, qualifications, skills |

Units and qualifications named in the file are created automatically. The
dialog verifies the file against the server before writing anything, and
reports which rows would be skipped and why.

To mark drivers and commanders, put `נהג` or `מפקד` in the qualifications
column — those are the two qualifications `scripts/setup-company.sql` creates,
and the ones סיור and כרמל each require one of.
