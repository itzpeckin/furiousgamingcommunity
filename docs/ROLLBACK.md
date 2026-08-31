# FranchiseHQ Rollback and Recovery

## 7.3.7 ownership history and player-experience candidate impact

The validated 7.3.7 candidate adds additive migration 27, season/week-scoped ownership periods, frozen GM season summaries, membership-authoritative career/trophy-case reads, and consolidated player-card/mobile experience repairs. It has not been published, applied to Production, or used to create/reconcile ownership rows. Production remains on exact accepted 7.3.6 commit `fd0458223f903da5533fec9c1b84ce69c7c4a19a`, migration 26, and Pages deployment `3138d4d2-d1f7-498e-a15d-89bdb6bdd162`.

After any future accepted publication, apply migration 27 before the 7.3.7 runtime. A runtime rollback restores the accepted 7.3.6 application while deliberately retaining migration 27 and every GM identity, team ownership period, GM season summary, membership, role, user, session, setting, rule, audit, import, and snapshot row. Do not drop the additive columns/table or rewrite ownership chronology.

Deployment or rollback does not authorize reviewed membership reconciliation, a Madden export/import, active snapshot change, reset, Archive Season, game-year transition, permanent deletion, export-URL rotation, credential change, or interpretation of blocked Free Agents as zero.

## 7.3.6 stable team/player URL impact

The accepted 7.3.6 application runtime is exact commit `fd0458223f903da5533fec9c1b84ce69c7c4a19a` on accepted Pages deployment `3138d4d2-d1f7-498e-a15d-89bdb6bdd162`. It adds no migration and performs no league-data operation. It reads existing permanent player identities and canonical team keys to expose authenticated league paths at `/leagues/{leagueSlug}/players/{publicPlayerId}` and `/leagues/{leagueSlug}/teams/{teamSlug}`. Current hash navigation remains a compatibility layer, and unauthenticated document recovery returns to the exact deep path after Discord authentication.

Runtime rollback restores exact accepted 7.3.5.1 Main commit `b84af9d9ffa5adb6cf440e733e83210cea83b3d9`, Pages deployment `eb95fd00-bdd6-4565-ae21-65da03b4bd0e`, and the unchanged import Worker build `2c7bc863-539d-45bf-a1a4-24edcf1c31b6` / version `d29befdd`. Retain permanent player identities/source aliases, active Week 9 snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`, previous snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8`, every data/audit row, and the permanent league export URL.

Do not use deployment or rollback to create/delete identities, export/import Madden data, move the active pointer, reset data, run Archive Season, run a game-year transition, rotate the permanent export URL, delete history, change credentials, or reinterpret Madden's blocked Free Agent route as zero.

## 7.3.5.1 display-integrity remediation impact

The authorized 7.3.5.1 runtime adds no migration and performs no league-data operation. It preserves the complete allowlisted ratings object through the final player-card adapter, converts canonical salary/cap-hit dollars once at the Trade Center's millions boundary, invalidates the old mis-scaled browser cache, and replaces static Season 4/Week 8 mock shell labels with active-snapshot season/week context.

Runtime rollback restores exact 7.3.5 Main commit `1d9cbc2186762e16da1028bbfd8fd2f326c984e9`, Pages deployment `484acd14-7d27-4dbd-81cc-c97b5fc638a4`, and import Worker build `b4588f36-cda5-4e83-8219-24e828992e8a` / version `2b745b42`. Retain active Week 9 snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`, previous snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8`, all data/audit rows, and the permanent league export URL.

Do not use deployment or rollback to export/import Madden data, move the active pointer, reset data, run Archive Season, run a game-year transition, rotate the permanent export URL, delete history, change credentials, or reinterpret Madden's blocked Free Agent route as zero.

## 7.3.5 active-snapshot experience impact

The local 7.3.5 candidate adds no migration and performs no league-data operation. It changes the authenticated member read model and browser presentation so Teams, rosters, players, standings, statistics, and Free Agents resolve from one active snapshot. It exposes only an explicit Madden rating allowlist and safe public ability fields, applies documented contract units, labels unavailable current-year contract splits honestly, paginates every rostered player, and removes live demo/legacy identity fallbacks and nested vertical-scroll traps.

Runtime rollback restores exact 7.3.4.7 Main commit `e95217cdad8560f8877841d41c4fb972885ac2b8`. Retain active Week 9 snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`, previous snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8`, every capture/report/mapping/snapshot/lifecycle/audit row, and the permanent league export URL. The 7.3.5 candidate does not require a schema rollback.

Do not use code rollback to re-export, import, move the active pointer, reset data, rotate the permanent export URL, run Archive Season, run a game-year transition, delete history, or reinterpret Madden's blocked Free Agent route as zero.

## 7.3.4.7 week-label normalization impact

The authorized 7.3.4.7 runtime adds no migration and performs no league-data operation. It retains the approved schedule route in the member read model and makes the already-normalized one-based game week authoritative in the browser. Madden's raw zero-based week remains a compatibility fallback only when a canonical week and authoritative route are unavailable.

The active Week 9 snapshot remains `b00edb25-ac65-40d4-9969-431f94dd1e3e`, with Preseason Weeks 1–3 and Regular Season Weeks 1–9 already stored correctly. Runtime rollback restores exact 7.3.4.6 Main commit `4c9d75a8ec09caa2bc50ae888fd6b2af255f58b3`, Pages deployment `dca6eb7d-9e6d-4678-ab7c-a5194429373c`, and import Worker version `e7d81630-5d93-4726-a0c2-f71e8c12e96a` while retaining that snapshot and all capture/import/audit evidence.

Do not re-export, re-import, rebuild or change the active snapshot, reset data, rotate the permanent export URL, run Archive Season, run a game-year transition, or reinterpret blocked/null Free Agents as zero as part of deployment or rollback.

## 7.3.4.6 route-authority and retained multi-period impact

The authorized 7.3.4.6 runtime adds no migration. It makes the capture route authoritative for schedule stage/week and allows one historical candidate to pin and compose every data-bearing retained period through the selected older source. For the authorized FGC retry, that retained scope is Preseason Weeks 1–3 plus Regular Season Weeks 1–8. Madden's all-zero Preseason Week 4 placeholder is excluded; no new Madden export or export-URL rotation is required.

The candidate starts from active Week 9 snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8`. It may overlay route-scoped games/statistics for retained earlier periods only. Teams, 2,042 active rostered players, rosters, standings, Madden game year, franchise season, and the live Week 9 position remain authoritative from the active snapshot. Every selected period must produce both games and statistics, validation must be ready, and the expected active pointer must still match before atomic activation.

Runtime rollback restores exact 7.3.4.5 Main commit `df3bcb7cd927f21acd3362d62a722d582f485884`, Pages deployment `927eb46c-1e53-4f72-a0b6-698c2a351861`, and Worker version `87b5571a-8aff-49f9-853a-d0749d968d6f`. Retain all 7.3.4.6 raw captures, reports, mapping runs, candidates, snapshots, lifecycle events, audit rows, and the active pointer produced by an accepted activation. Code rollback does not imply snapshot rollback.

Do not reset data, delete history, rotate the permanent export URL, require another export, run Archive Season, run a game-year transition, roll the live state back to Week 8, or reinterpret blocked/null Free Agents as zero.

## 7.3.4.5 historical-backfill and live-refresh impact

The authorized 7.3.4.5 patch adds no migration and performs no data operation during deployment. It changes candidate composition only when a commissioner later selects **Import Latest Export** for an eligible source older than the active week. That source must belong to the exact active Madden game year and franchise season and prove schedule plus statistics coverage for its captured week.

A historical-backfill candidate starts from the current active immutable snapshot. It preserves teams, players, rosters, standings, season year, live week, later games/statistics, previous backfills, source evidence, and blocked/null Free Agent semantics. Only exact-ID games/statistics scoped to the captured earlier week may overlay the candidate. Validation and expected-prior-pointer activation remain atomic. After success, the browser refreshes its read model and current route in place; no page reload or session mutation is required.

The runtime rollback baseline is exact 7.3.4.4 Main commit `5a16ccb311b368ae1df5f7fcf3e4f95bc01c9cd8`, Pages deployment `51e55575-0032-41af-b5d3-a69c67f54d2e`, and Worker version `1e01f1a9`. A code rollback must retain every snapshot and any historical backfill already activated. Restoring a prior active pointer is a separately reviewed snapshot rollback, never an implied runtime rollback.

Production Pages deployment `927eb46c-1e53-4f72-a0b6-698c2a351861` and import Worker build `cee1559b-8fde-4679-8abb-460601915235` / version `87b5571a-8aff-49f9-853a-d0749d968d6f` run exact Main commit `df3bcb7cd927f21acd3362d62a722d582f485884`. Read-only reconciliation recorded zero deployment database writes. Active Week 9 snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8` was activated earlier by release 7.3.4.4 and retains `8b47ec76-7369-495e-913f-edc0310b49e1` as its previous pointer; both must survive runtime rollback.

Do not use rollback to reset league data, delete historical records, rotate the permanent export URL, run Archive Season, run a game-year transition, roll the active week backward, or reinterpret blocked/null Free Agents as zero.

## 7.3.4.4 one-action workflow impact

The authorized 7.3.4.4 candidate changes routine commissioner workflow without adding a migration. **Import Latest Export** now creates or reuses the current franchise-season destination, completes validation, and compare-and-swaps the active pointer to that exact candidate in one request. The active snapshot, snapshot/game-year/season statuses, lifecycle event, and tenant audit are written in one D1 batch guarded by the expected prior pointer. If validation fails or another writer changes the pointer, the prior live snapshot remains authoritative.

**Archive Season** is a separate one-action same-edition boundary. It freezes player-season summaries and ownership periods into the immutable closure evidence, closes the completed franchise season, prepares the next franchise-season row, archives only the old import destination, and clears only the endpoint's latest-source selection. It retains every snapshot, record, capture, report, closure, lifecycle event, audit row, and the permanent URL token version. It does not run during deployment or Week 9 activation.

Production Pages deployment `51e55575-0032-41af-b5d3-a69c67f54d2e` and import Worker build `44d2c02b-f6e1-433f-9e28-339fa6d0f382` / version `1e01f1a9` run exact Main commit `5a16ccb311b368ae1df5f7fcf3e4f95bc01c9cd8`. Exact Week 9 snapshot `8b47ec76-7369-495e-913f-edc0310b49e1` is active and prior Week 7 snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` is archived and retained as its previous pointer. Runtime rollback may restore 7.3.4.3 commit `0a5dc06b90fbf2fe718482106c5c7a037f2d6dfa`, Pages deployment `3d667ec0-73f8-4188-9e5b-76f154634dfe`, and import Worker build `8fa92466-efe6-438f-8811-3cae1c4f6138`, but it must retain the active Week 9 pointer and all lifecycle/audit evidence. Restoring Week 7 is a separately reviewed snapshot rollback, never an implied code rollback.

Do not use rollback to delete history, reset league data, rotate the export URL, run Archive Season, run a Madden game-year transition, restore D1, manufacture Week 8, or reinterpret blocked/null Free Agents as zero.

## 7.3.4.3 exact-session import remediation impact

Production Pages deployment `3d667ec0-73f8-4188-9e5b-76f154634dfe` and import Worker build `8fa92466-efe6-438f-8811-3cae1c4f6138` run exact Main commit `0a5dc06b90fbf2fe718482106c5c7a037f2d6dfa`. The 7.3.4.3 patch changes browser-side candidate orchestration, legacy dataset classification, and Teams capture selection only. It adds no migration and did not run the candidate importer. The exact latest-ready source remains recovered session `m27_recovered_8bf2666ce3393492ed580dac` / report `m27_report_8bf2666c-e339-3492-ed58-0dac09b696c9`; active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` remains unchanged.

Runtime rollback may restore exact 7.3.4.2 commit `e95ad2f4a6989433a05f9bf7ea605caa0e83b165` / Pages `0747aebd-5f6a-4852-b3c4-98aaffb20ad0` while retaining the recovered session/report, raw captures, legacy inspections, audit rows, endpoint pointer/token version, failed import-run evidence, and active snapshot.

Do not use rollback to retry or activate the candidate, hide the missing Week 8 warning, reset data, rotate the export URL, run a game-year transition, restore D1, create another Madden export, or reinterpret blocked/null Free Agents.

## 7.3.4.2 cohort-remediation impact

The authorized 7.3.4.2 patch changes only automatic permanent-export cohort claiming and an exact, platform-owner-only recovery path. It adds no migration. The observed Production burst from `2026-08-30T21:33:47.826Z` through `2026-08-30T21:33:49.047Z` contains 43 retained routes but was fragmented across eight sessions by concurrent 7.3.4.1 requests.

Recovery created immutable session `m27_recovered_8bf2666ce3393492ed580dac`, report `m27_report_8bf2666c-e339-3492-ed58-0dac09b696c9`, 43 links to existing R2 objects, and one audit row; it did not copy or delete raw payloads. Exact runtime `e95ad2f4a6989433a05f9bf7ea605caa0e83b165` is deployed as Pages `0747aebd-5f6a-4852-b3c4-98aaffb20ad0`. Original fragmented sessions/reports and all recovery evidence must be retained. Runtime rollback may restore initial 7.3.4.2 deployment `b0706bba-2c8c-4145-ab71-382b174c39d5`, but must not delete or repoint recovery evidence. The pre/post recovery bookmarks are `00000033-000002da-000050d7-045330f7b66ceda9d6eab234f120a1fe` and `00000034-0000004a-000050d7-185ac0b6bf799c1657dc4d353c8390e2`; Time Travel is destructive and remains separately owner-authorized.

Do not import or activate a candidate, reset data, rotate the permanent URL, run a game-year transition, restore D1, or reinterpret the blocked/null Free Agent result as part of this remediation or rollback.

## 7.3.4.1 Production impact

The local 7.3.4.1 candidate adds additive migration 26 and a permanent Madden Companion export endpoint for each league. The URL credential is derived from a protected server root, league ID, and token version; D1 stores no raw credential. Rotation increments the version and invalidates only the previous URL. The endpoint row and its current version persist across normal imports and game-year archive/removal operations.

Raw captures and structural reports remain immutable. Each request burst is linked to an automatic discovery cohort and analyzed after a quiet window. `latest_report_id` may show an incomplete or failed newest export, but `latest_ready_report_id` advances only for an eligible source. A rollback must retain all capture, report, candidate, identity, and audit rows and must not repoint or activate a snapshot.

Production Pages deployment `0eec0551-216c-4f32-8aed-e8a7fbcb81ab` runs exact Main commit `6de7c1018c89bc8fd6868fbde984f7a496e2a69d`. Migration 26 is applied to `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`; the pre/post bookmarks are `00000032-00000000-000050d7-f42cc5c918932fe187a765a42a32342b` and `00000032-00000008-000050d7-3c7fd83fe2a1d18c39cbc80d28444ede`.

Runtime rollback may restore exact Production 7.3.4 commit `431583ea7a472c4ba5292bea1a1775e7f0309b33` / Pages deployment `fafabfb2-91fe-4759-9cf8-8872365c6777` while retaining the additive endpoint table and token version. Do not drop migration 26, delete endpoint/capture rows, rotate credentials, reset data, run a transition, or change active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` as an improvised rollback. Time Travel recovery overwrites Production and requires separate owner authorization. Blocked Free Agents remain unknown/null.

## 7.3.4 candidate impact

The local 7.3.4 review candidate changes repeat-import source selection and private candidate composition only. It adds no migration and has not been published, deployed, run against a real Week 9 capture, changed Production or Git Main, reset/transitioned data, or activated a snapshot.

Candidate identity remains the exact analyzed report plus capture digest, reviewed identity preview, and destination. An identical export reuses the same candidate; a different fingerprint may create a new append-only candidate. The active pointer is checked before finalization and is never written by the importer.

Same-season history carry-forward copies only older game/statistic records from the exact active snapshot when it is linked to the same Madden game year and franchise season. Fresh exact-ID records win. The candidate manifest records the source snapshot, retained counts/weeks, and any coverage gap. A code rollback simply returns to exact 7.3.3 evidence baseline `c5b87dbb46cb42841510538cbcb8bf4272ed772e`; do not delete candidate rows or change the active snapshot.

## 7.3.3 Production impact

Production Pages deployment `e926a37f-50b1-4b8c-af83-84364a7d4960` runs exact source commit `b373f661101c33a2ee2bd17433cfe4001f166b3f`. The Cloudflare Pages Production branch setting was restored to `main` immediately after the exact deployment succeeded; Git `main` remains `4045e02980c93491b47910f17fcb2e48fae76c68`.

Additive migration 25 is applied to `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`. The ledger is continuous through 25, foreign keys are clean, and protected counts plus exact active snapshot `841ce1b5-a4a6-4246-a53a-01cd1f189663` are unchanged. Production transition runs, archive manifests, recovery bookmarks, and archive removals are all zero; no archive, detach, active-data removal, recovery, reset, or activation was run.

A code rollback retains the additive game-year tables and links. Do not reverse migration 25 by dropping tables or clearing `game_year_id`. Before any future data transition, recovery depends on a read-back-verified immutable archive manifest plus its recovery bookmark. Detach and active-data removal are refused until verification succeeds, and rollback restores only the exact scoped rows, source objects, prior active pointer, and team assignments recorded by that bookmark.

For a runtime-only rollback, restore prior Pages deployment `61165506-9d06-4f95-9760-58f73389d37c` while deliberately retaining the current Madden 27 database binding and migration 25. Do not reconnect the detached Madden 26 database, move Git Main, clear game-year links, reset data, or change the active snapshot as part of a code rollback.

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

The 7.1/7.2 application can operate with the additive 7.3 discovery schema, so normal code rollback retains migrations 21 through 26 rather than trying to reverse tables.

## Database recovery

Follow `docs/DATABASE-OPERATIONS.md`. Before migrations 21 through 26, record the D1 Time Travel bookmark, ledger, table/row counts, tenant identities, memberships, rules, settings, active snapshot pointer, validation-player rows, and foreign-key result.

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
