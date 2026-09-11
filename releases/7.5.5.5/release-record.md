# FranchiseHQ 7.5.5.5 Release Record

**Status:** Production deployed; owner UI/Discord acceptance pending

**Production changed:** Yes. PR #72 merged to Main as `2fea2a6166d0bc3020fbf17eedf0b483550f671f`, additive migration 40 is verified on the exact Madden 27 Production D1 database, and Git-integrated Pages deployment `08ed1fdf-86ee-45f3-95e7-4c8a1d67824b` serves release 7.5.5.5.

## Scope

Make the Discord Trade Submit decision surface an exact presentation match for the private trade thread, restore league-configured Trades Available to Teams & Owners, and provide audited commissioner trade-history and allowance controls without changing Madden-authoritative team ownership.

## Added during delivery

- Trade Submit posts one team-colored, logo-backed set of the same player, contract, draft-pick, and status cards used by the private trade thread, with Approve/Deny controls on that message.
- Discord no longer posts a second plain or differently formatted asset breakdown. If Discord strips the cards, the incomplete post is removed and its durable event stays retryable with an actionable Embed Links error.
- Teams & Owners displays each team's available trades from the editable league setting and opens a polished approved-trade ledger with the actual assets sent and received.
- Commissioners can restore season allowances, remove one approved trade from visible history, or clear all visible Trade Center history through distinct confirmed actions.
- Additive migration 40 records tenant-scoped, season-scoped, actor-scoped management events while retaining every protected workflow, roster overlay, draft-pick owner, canonical transaction, and audit row.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation evidence

Focused Discord, Trade Center, Teams & Owners, mobile, migration, and tooling regressions pass. The complete strict repository gate covers 214 tests, 255 JavaScript modules, 23 canonical migrations, 116 required tables, and 76 Pages routes.

The reset/removal regressions prove commissioner-only authorization, configured allowance restoration, visible-history removal, retention of canonical transaction and roster evidence, append-only management/audit rows, and no Free Agent reinterpretation.

## Deployment status

Exact candidate `ac3a52045974cadeb48961e821161185531afbe4` was published through PR #72 with all four pull-request checks passing. Before the merge, the exact Production D1 target `franchise-hq-db-madden27` (`b2529150-28af-42ca-a07b-69506764ccb6`) was confirmed and recovery bookmark `000001dd-000000b0-000050e3-0cd8ead449d5874d01322744d8754512` was recorded.

Migration 40 then created one table, two named indexes, four foreign keys, nine columns, and one migration-ledger row. It changed no existing league or trade row. Post-migration verification found version 40, 116 canonical tables, zero foreign-key violations, zero management-event rows, and unchanged protected counts before bookmark `000001dd-000000c2-000050e3-e3db31d4692604df63ed35ca7f3d8392` was recorded.

PR #72 merged as Main `2fea2a6166d0bc3020fbf17eedf0b483550f671f`; all five Main quality/build/deployment checks passed. Git-integrated Pages deployment `08ed1fdf-86ee-45f3-95e7-4c8a1d67824b` returns HTTP 200 with release header 7.5.5.5 from both the public and canonical FGC routes.

Authenticated read-only acceptance verified the live Trades Available column, the team allowance ledger, and both distinct commissioner maintenance controls. No live reset, individual removal, trade action, Discord command registration/configuration, import, snapshot change, archive/transition, export URL rotation, credential/membership/assignment change, or Free Agent reinterpretation ran. A newly accepted trade is still required for owner validation of the corrected Discord committee presentation because historical Discord messages are intentionally not rewritten.

## Rollback

The exact code rollback baseline is Main commit `516f01d723d04a589b11692b94d272912d78b97f` with tree `afd746a00fb9afbb7b50d0956698c439c2c43151`. Migration 40 is additive and may remain safely in place during a code rollback; it does not mutate existing league or trade rows. If schema recovery were separately authorized, use the pre-migration bookmark recorded above. No restore was required or performed.
