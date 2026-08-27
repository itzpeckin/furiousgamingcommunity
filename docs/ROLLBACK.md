# FranchiseHQ Rollback and Recovery

## 7.2.0 candidate impact

The local 7.2.0 candidate adds migration 21, a central tenant resolver, server-owned tenant configuration, tenant-scoped Companion namespaces, audit context, and isolation/preservation tests. It has not run a cloud migration, deployed staging or production, reset or activated Madden data, edited memberships, changed Discord configuration, or redesigned session-refresh behavior.

The current production rollback target is:

- Version: 7.1.0
- Merged commit: `4045e02980c93491b47910f17fcb2e48fae76c68`
- Git tree: `c090eb27500c93dff91d23f79a82706e175acfb0`
- Existing immutable emergency tag: `v7.0.0`

## Code rollback

1. Stop when the candidate commit, manifest, migration hash, or environment identity differs from the accepted record.
2. Use a normal rollback pull request from the accepted baseline; never force-push `main`.
3. For an unhealthy Cloudflare build, restore the last known-good deployment while the Git rollback is reviewed.
4. Run production smoke checks and record the restored deployment identity.

The 7.1 application can operate with the forward-compatible 7.2 schema, so normal code rollback retains migration 21 rather than trying to reverse table rebuilds.

## Database recovery

Follow `docs/DATABASE-OPERATIONS.md`. Before migration 21, record the D1 Time Travel bookmark, ledger, table/row counts, tenant identities, memberships, rules, settings, active snapshot pointer, validation-player rows, and foreign-key result.

Never replay `migrations/legacy/` and never improvise rollback by dropping tenant tables. If reconciliation fails, stop application publication. A Time Travel restore overwrites the database and requires separate owner authorization.

## Object storage and cache recovery

- Existing R2 objects remain readable through their retained D1 object keys.
- New 7.2 captures use tenant-ID paths; code rollback does not delete or move them.
- KV pointers can be reconstructed from D1 and may be changed only for the selected tenant.
- No source artifact or active snapshot is deleted as part of code rollback.

## Stop conditions

- Authentication or authorization boundaries fail.
- Staging/production points at the wrong resource.
- Migration preservation or tenant-isolation reconciliation differs from the accepted evidence.
- FGC is not the sole enabled production tenant.
- Existing rules, settings, active snapshot, imports, memberships, or stored captures become unavailable.
- Critical user flows fail or monitoring cannot identify the release state.
