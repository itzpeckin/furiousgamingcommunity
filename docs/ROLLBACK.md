# FranchiseHQ Rollback and Recovery

## 7.3.3 candidate impact

The 7.3.3 review candidate adds migration 25 and commissioner-operated game-year transition controls. This implementation cycle does not apply the migration to a cloud database, write an archive, detach or remove data, change the active snapshot, deploy Production, or change Git Main.

A code rollback retains the additive game-year tables and links. Do not reverse migration 25 by dropping tables or clearing `game_year_id`. Before any future data transition, recovery depends on a read-back-verified immutable archive manifest plus its recovery bookmark. Detach and active-data removal are refused until verification succeeds, and rollback restores only the exact scoped rows, source objects, prior active pointer, and team assignments recorded by that bookmark.

Archive-object deletion is a distinct irreversible operation with its own typed league-and-edition confirmation. It retains manifest and tombstone rows but eliminates application-level restore from those objects. Never use it as a code rollback. Blocked or missing Free Agents remain null/unknown throughout archive and recovery.

## 7.3.2 Production acceptance impact

Production Pages deployment `ebcf42ec-5a7c-4efa-8e88-891f6c06fcaa` and Worker version `3b883a17-04bf-4c46-8b2d-e5ab5b98658e` run exact source commit `4f5e81b4cc924e72bc9b8499ae12164bfd12620c`. Git `main` remains `4045e02980c93491b47910f17fcb2e48fae76c68`; PR #12 remains open.

The active Pages bindings now point to `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`. The former database `franchise-hq-db` / `d21fb8c2-1b26-4766-9249-73af5d8b6678` is detached and retained as the Madden 26 relational archive. Do not delete or restore either database as an improvised rollback.

The private Madden 26 archive prefix is `game-year/madden-26/league/franchise-hq-primary/2026-08-29` in `franchise-hq-game-year-archives`. Its verified manifest covers 38 domain tables and 76,712 rows. The 1,295 former raw Companion R2 objects were permanently deleted and cannot be restored from that source bucket.

Application rollback may restore Pages deployment `4b1d6840-69d3-485a-957b-e4af9491d727`, but its expected D1 binding must be reviewed deliberately. Restoring code without reviewing the database binding can reconnect the archived Madden 26 data or present an incompatible schema. A snapshot rollback is neither needed nor authorized because no active snapshot exists.

The 7.3.2 Production candidate is validation-ready but its first cold rehearsal took 74.387 seconds. Do not represent the sub-60 Production cold target as accepted; the isolated-staging rehearsal remains the only measured passing cold run at 23.456 seconds.

## 7.3.0 candidate impact

The local 7.3.0 candidate adds migration 22, short-lived hashed Madden 27 discovery sessions, duplicate-payload session links, structural dataset/source reports, explicit Free Agent proof states, and a private Platform Workspace capture flow. It has not been committed, published, migrated to staging/production, given a real FGC export, reset any data, or changed an active snapshot.

Migration 22 is additive. A code rollback retains its three tenant-scoped discovery tables; abandoned session tokens expire and no raw token can be recovered from D1. Any captured raw object remains private in the existing R2 bucket and is not activated automatically.

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

The 7.1/7.2 application can operate with the additive 7.3 discovery schema, so normal code rollback retains migrations 21 through 25 rather than trying to reverse tables.

## Database recovery

Follow `docs/DATABASE-OPERATIONS.md`. Before migrations 21 through 25, record the D1 Time Travel bookmark, ledger, table/row counts, tenant identities, memberships, rules, settings, active snapshot pointer, validation-player rows, and foreign-key result.

Never replay `migrations/legacy/` and never improvise rollback by dropping tenant tables. If reconciliation fails, stop application publication. A Time Travel restore overwrites the database and requires separate owner authorization.

## Object storage and cache recovery

- Existing R2 objects remain readable through their retained D1 object keys.
- New 7.2 captures use tenant-ID paths; code rollback does not delete or move them.
- New 7.3 discovery sessions link captures by tenant/session/capture identity; code rollback does not activate or delete them.
- KV pointers can be reconstructed from D1 and may be changed only for the selected tenant.
- No source artifact or active snapshot is deleted as part of code rollback.

## Stop conditions

- Authentication or authorization boundaries fail.
- Staging/production points at the wrong resource.
- Migration preservation or tenant-isolation reconciliation differs from the accepted evidence.
- FGC is not the sole enabled production tenant.
- Existing rules, settings, active snapshot, imports, memberships, or stored captures become unavailable.
- Critical user flows fail or monitoring cannot identify the release state.
- A rollback would reconnect a detached game-year database without explicit review.
