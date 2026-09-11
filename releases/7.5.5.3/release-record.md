# FranchiseHQ 7.5.5.3 Release Record

**Status:** Production deployed and read-only verified; owner UI and Discord acceptance pending

**Production changed:** Yes, code and additive schema only. FranchiseHQ 7.5.5.3 is live from merged Main commit `c7b7560deaded7f04ca7e91f3096d92cf376d6ec`, and the Madden 27 Production database is on migration 39. No league content, snapshot pointer, Discord routing, command definition, membership, credential, or live trade was changed.

## Scope

Complete the Discord trade workflow without changing the canonical Trade Center authority. Private owner threads and the configured Trade Committee channel render the same structured trade package, with player and contract facts visibly separated, draft picks promoted, and the current workflow status always explicit.

Each league can select one existing mentionable, non-managed Discord role for committee review. The delivery mentions only that exact role and retains the existing Approve and Deny controls. A missing configured role produces no broad mention.

Final owner rejection, proposer cancellation, or committee approval posts the result and then archives and locks the private trade thread. Committee denial leaves the thread open for revision. Revising or countering reopens the archived thread when needed and reuses its existing Discord thread rather than creating a second negotiation.

The canonical Player Card Contract panel removes unsupported Current Salary and promotes the source-backed Total Release Penalty alongside Cap Hit, Net Release Savings, Total Contract, Total Bonus, and term.

## Added during delivery

- Additive migration 39 adds only `discord_league_installations.trade_committee_role_id`.
- Commissioner Discord routing exposes one verified Trade Committee role selector alongside the existing channel selectors.
- Owner and committee destinations share the exact detailed trade formatter and decision-state labels.
- Discord allowed-mention payloads are restricted to the configured committee role.
- Thread close is retry-safe: the final message and archive/lock operation are tracked independently if Discord accepts one but not the other.
- Revision reopens and reuses the same verified private thread.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Validation target

- Current Salary is absent and Total Release Penalty remains visible on the Player Card.
- Player identity and contract facts are separate; draft picks are visually prominent.
- Committee review carries the same assets and details as the owners' private thread, plus Approve/Deny buttons and only the configured role mention.
- Final approval/rejection/cancellation removes the negotiation from active threads through archive and lock while retaining Discord history.
- Committee denial remains open, and revision continues in the same thread.
- Migration 39 is additive, the canonical ledger remains continuous, and protected league/account/data counts are unchanged in migration fixtures.

## Validation evidence

The focused migration, Discord, Player Card, and release-tooling suite passes 55/55. The complete strict repository gate and Main hosted quality gate pass 214/214, including 255 JavaScript syntax modules, 22 canonical migrations, 115 required tables, and 76 routes.

## Deployment status

PR #68 published exact candidate `3b6c91d5456dfc1b32b1417473bf4a587872127e`. All four pull-request checks passed before merge. After exact Madden 27 Production D1 target confirmation, recovery bookmark `000001da-00000926-000050e3-09f58c5ae20fbd53747f31e6f04a99ea` was recorded and migration 39 was applied without the introductory SQL comment. The migration ledger row, the single `trade_committee_role_id TEXT` column, the installation table, protected counts, and foreign-key integrity all passed verification. Post-migration bookmark `000001da-00000936-000050e3-a961042fa6bd19848b856e06f3fe7cf2` was then recorded.

The PR merged to Main as `c7b7560deaded7f04ca7e91f3096d92cf376d6ec`. All five Main quality/build/deployment checks passed, and Git-integrated Cloudflare Pages deployment `b569a8ec-cf7e-4cad-96d4-302d3031776c` published the merge. Read-only HTTPS acceptance returned `200` and `x-franchisehq-release: 7.5.5.3` from both the public and canonical FGC league routes. The deployed application bundle contains **Total Release Penalty** and no **Current Salary** label.

Read-only D1 acceptance found migration 39, 115 tables, zero foreign-key violations, one unchanged active-snapshot row, and active Season 2026 / Week 19 snapshot `2b31297b-19e1-4f28-b86d-e8ff375ceca3` with 32 teams, 2,014 rostered players, 326 games, 14,816 statistics, and 32 standings. The source retains its blocked Free Agent warning, so the public count remains unknown/null rather than zero. One Discord installation remains present and no Trade Committee role was configured during deployment.

## Boundaries

Discord command registration, Discord configuration change, live trade action, import, reset, snapshot operation, archive-season operation, transition, export-URL rotation, credential change, membership/assignment change, and league-data writes outside migration 39 did not run. Blocked Madden Free Agents remain unknown/null and are never interpreted as zero.

## Rollback

The exact code rollback baseline is Main commit `39bb93a9451150e947616c82879424ad465634a0` with tree `1abdea74852d9ff6faebf079fde2417b5eac3855`. Migration 39 is additive. If schema recovery were required, use the pre-migration D1 bookmark recorded above through the separately authorized recovery process; no restore was required or performed during this release.
