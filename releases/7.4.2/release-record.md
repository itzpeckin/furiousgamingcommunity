# FranchiseHQ 7.4.2 Release Record

**Status:** Production deployed and read-only verified; signed-in owner acceptance pending

**Production changed:** Yes. Exact candidate `9cd8087b0e70d728eeb0d919dd6c99e9130a21d8` is merged to Main as `f09f5611cbca7ac6b12685f167300c2c06322f99`, Production serves FranchiseHQ 7.4.2, and additive migration 32 is verified.

## Scope

This consolidated cycle replaces the fragmented Commissioner HQ with a purpose-built, responsive league control room and completes the roadmap's server-authoritative feature-settings and revisioned Rules work.

## Added during delivery

- A six-workspace Commissioner HQ: Command Center, League Data, People & Teams, League Controls, Rules Studio, and Audit & Revisions. The new visual system uses a polished navy command shell, live status metrics, a priority queue, compact operational launch cards, responsive tables, and phone-safe navigation.
- A commissioner-only consolidated endpoint for tenant metrics, active snapshot status, membership/assignment totals, managed feature state, Rules state, transactions, setting revisions, and recent audit activity.
- League-wide Trade Center, Trade Block, Confidence Pool, and Game of the Week switches backed by `league_features` and a matching `league_settings` revision. Every mutation is tenant-audited and rejects stale revisions rather than overwriting a second commissioner's newer change.
- A private Rules workspace with Save Draft, explicit Publish Rules, immutable publication history, immutable workspace revisions, bounded document validation, and optimistic conflict handling. Team owners receive only the published rulebook.
- A consolidated People & Teams presentation over the existing authenticated Discord membership, franchise assignment, role, and access controls. Existing commissioner-only permission checks remain the mutation authority.
- Member-facing feature enforcement so disabled Trade Center, Trade Block, Confidence Pool, and Game of the Week experiences disappear consistently, while deep links fail closed into the league shell.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. Its count stays unknown/null and is not interpreted as zero. This release does not run or change an import.

## Validation evidence

Focused tests prove migration-32 preservation and backfill, private draft/public Rules separation, stale Rules rejection, commissioner-only feature mutations, league-wide settings revision authority, audit rows, and bounded Rules validation. Fresh and production-shaped schema tests reach migration 32 with zero foreign-key violations.

The full consolidated repository gate covers every existing import, transition, Trade Center, transaction, tenancy, authorization, and session regression in addition to the new Commissioner suite. The active snapshot context remains the Command Center's season/week authority, and responsive CSS includes compact desktop and single-column phone behavior.

## Deployment status

Published through [PR #41](https://github.com/itzpeckin/furiousgamingcommunity/pull/41) after all four candidate checks passed. Before the schema change, Production D1 target `franchise-hq-db-madden27` (`b2529150-28af-42ca-a07b-69506764ccb6`) was confirmed and Time Travel bookmark `000000f8-00000532-000050dd-89b92d5647f4c1d78a5b6a782388ca33` was recorded. Exact migration hash `cacf18ef86c03459cefc3c0bcbdbaa65a013fb76456c9047799beca46efd0a67` then advanced the continuous ledger from 31 to 32 and created the three revisioned Rules tables.

Production had no published `league_rules_documents` row to backfill, so the new Rules workspace, publication, and revision tables correctly begin empty. The migration preserved all seven existing feature rows and added only the previously implicit `trade_block` managed-feature default; Trade Center, Trade Block, Confidence Pool, and Game of the Week are now all present and enabled. Settings remained exactly one row at revision 6 and 1,688 bytes, audits remained 79 rows, and the post-migration bookmark is `000000f8-00000550-000050dd-ff21f7db3dd0a347781491898d23320b`.

PR #41 merged to Main as `f09f5611cbca7ac6b12685f167300c2c06322f99`. All five Main quality, build, Pages, report, and deployment checks passed. Production Pages deployment `c1ea3828-1918-4717-a13d-ba03f72c5cf6` is live. The import Worker source did not change, so Production correctly retains build `b87f1bb1-71cc-4695-af0c-c3fe1415223f` / version `326ee7ef-55b2-4041-8eb2-db4ee9358bd0`; exact-candidate preview build `1c79a4f0-1992-4193-bb6e-8cc5f31afb5d` / version `a204f33f-8a98-44b3-b097-95d2e7918cac` passed before merge.

Read-only HTTPS acceptance confirmed the 7.4.2 public and canonical-league release markers, exact Main hashes for `trade-module.js` and `styles.css`, and a `401 Authentication required` response from the signed-out Commissioner HQ endpoint. Protected counts remain exactly 1 league, 28 users, 28 memberships, 27 active team assignments, zero legacy teams/players/snapshots, one active pointer at `ee1d3679-563d-4e6a-a2ef-4eb44b91af24`, 672 draft picks, and 1,344 pick-ledger events. `PRAGMA foreign_key_check` returned no violations.

No import, snapshot activation, reset, deletion, Archive Season, game-year transition, export-URL rotation, credential change, membership change, draft-pick ownership operation, Rules publication, or commissioner setting mutation ran. Free Agents remain explicitly blocked with a null count and were not interpreted as zero.

## Rollback

The immutable rollback baseline is exact Main evidence commit `2b691a046aa6afdcaaa8ee453901b2743b94ff90`, tree `1f7ed57d41d821132450b1d19db08f2c010af666`, representing the recorded FranchiseHQ 7.4.1 Production state.

## Next gate

The owner can perform signed-in acceptance of the Command Center, People & Teams, League Data, League Controls, Rules Studio, and Audit workspaces. No data-changing acceptance action is required.
