# FranchiseHQ 7.5.2 Release Record

**Status:** Production deployed; pending owner UI acceptance

**Production changed:** Yes for the authorized Git-integrated application release and exact `/trade` command upsert. No Production Madden data, snapshot pointer, credential, membership, assignment, or lasting Pages configuration changed.

## Scope

Correct the browser presentation boundary that could relabel a canonical Week 10 game as Week 1 when its retained Madden provenance still named the All Weeks sentinel route `/week/reg/0/`. The active snapshot's canonical week remains authoritative for that sentinel provenance, while ordinary nonzero routes retain their existing authority.

The accepted 7.4.0.2 server correction remains intact: non-empty All Weeks schedule and statistic payloads resolve their payload period, and empty Week 0 placeholders remain non-playable. The retained 43-route recovery and corrected Week 10 activation had already completed before this release. Production has since advanced legitimately to Week 17, so 7.5.2 does not repeat the export, import, or activation and does not roll the active pointer backward.

## Added during delivery

- The shared browser week resolver treats only regular-season route Week 0 as sentinel provenance when a canonical one-based snapshot or game week is available.
- With no canonical week, route Week 0 remains Week 0 and is excluded as a placeholder instead of becoming Week 1.
- Every ordinary nonzero route continues to win over fallback metadata.
- The league shell now uses one shared active-snapshot season resolver, preventing standing-source Week 0 metadata from forcing the home, schedule, results, or statistic views to Week 1.
- Release asset keys advance to 7.5.2 so browsers fetch the corrected resolver and application shell.
- Release tooling can select exact Discord command names and fails closed if a requested definition is absent; 7.5.2 used that path only for `/trade`.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is never interpreted as zero.

Migration 37 and its three retained trade-room rows were already present in Production from the Mac-authored 7.5.1 work. The 7.5.2 preflight verified the continuous 1–37 migration ledger and did not reapply it or write database rows.

## Validation evidence

Focused regression coverage proves canonical Week 10 wins over `/week/reg/0/` provenance, an unresolved Week 0 remains a placeholder, nonzero route authority is preserved, and standing sentinel metadata cannot override the active snapshot. The focused Week/import regression passes 48/48 tests. The complete strict gate passes 207/207 automated tests, 255 JavaScript syntax checks, 599 inventoried files, 76 routes, migration 37 schema validation, deterministic inventory, secret scanning, environment validation, and the release contract.

Read-only Production D1 verification found migration 37, 115 canonical tables, zero foreign-key violations, 26 retained snapshots, and unchanged active Week 17 snapshot `ac7d4912-e298-418f-b43e-d07fc1c409fb` with previous snapshot `21cb58dd-2226-43b9-9646-05a25a62e775`. Both historical Week 10 snapshots remain retained: malformed `88b9b131-dbd9-439b-96a0-c3b572a23586` and corrected `180ef684-479e-44cc-b336-7ae6e825f070`. The corrected snapshot retains 198 games and 7,736 statistics, including 14 Week 10 games and 361 Week 10 statistic records; validation and activation lifecycle audits remain present for both snapshots.

## Deployment status

PR #58 merged two validated commits to Main as `ad8133954a2c43b8bd69cd487b2c2b148e81ab49` after 4/4 checks passed. Git-integrated Production deployment `98c7abc0-70f1-47c1-bced-63de413239fa` succeeded. A bounded retry using the same merge source performed the exact non-destructive `/trade` upsert and produced accepted Production deployment `b34fa8b8-1bfb-4fe1-bec7-15c51528be9b`; its build recorded one upsert and zero retired names. The Production build command was restored to `exit 0` immediately afterward. No direct upload was used.

No Madden export, retained-source rebuild, candidate import, snapshot activation, reset, deletion, archive, transition, URL rotation, credential change, membership/assignment change, or database write ran during this release. The existing recovery bookmark `000001ce-00000404-000050e2-57028adf11107caf839193697ead342e` is retained.

## Rollback

Restore exact Main source baseline `5619b1e97edd5e75a03aaf72aa23a8a277d57e11` if runtime acceptance fails. Leave additive migration 37 in place. Do not roll back, delete, or mutate retained snapshots, imports, source captures, reports, audits, trades, memberships, assignments, Discord credentials, permanent export URLs, or blocked/null Free Agent state.
