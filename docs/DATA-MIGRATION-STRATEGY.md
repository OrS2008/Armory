# Data migration strategy

## Safety rule

V2 uses a separate D1 database. No production migration or destructive legacy operation is authorized by this plan.

## Required stages

1. Freeze and back up the legacy database and encrypted document rows.
2. Export schema versions, counts and ciphertext envelopes without logging plaintext.
3. Establish whether v2 preserves the legacy cryptographic envelope or performs an authenticated browser-assisted re-encryption.
4. Map records/reports/docs/vault/users into normalized v2 entities.
5. Run a disposable dry-run; record accepted, rejected and ambiguous rows.
6. Reconcile counts, relationships, statuses, licence dates, quantities and document hashes.
7. Test rollback by discarding v2 and restoring the untouched legacy system.
8. Obtain explicit approval before cutover.

## Current mapping status

Records, reports, documents and users are mapped conceptually. The encrypted aggregate `vault` requires domain-specific expansion into inventory, armoury, ammunition, vehicle, fuel and movement tables after decryption. This is planned, not implemented.
