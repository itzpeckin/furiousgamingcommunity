# FranchiseHQ 7.3.1 Release Record

**Status:** Isolated-staging validated; permanent identity, authenticated source analysis/mapping, and the private 32-team/2,044-player preview are complete

**Production authorized:** No

**Production changed:** No. Production remains FranchiseHQ 7.1.0.

## Scope

Add permanent franchise-season, player/source-alias, player-season, GM-person, and team-ownership-period identity. Map the already certified 32-team/2,044-rostered-player source into a private preview after the authenticated staging report gate, without waiting for the blocked Free Agent route and without activating a snapshot.

## Added during delivery

- Added migration 23 with tenant-scoped permanent identity and non-activating preview tables.
- Stable player aliases are keyed by league, source system, source franchise, and source player ID so a player survives seasons, team changes, and later Madden editions.
- Player season summaries retain distinct season state and permanent career totals.
- GM identity belongs to a person; partial unique indexes prevent one GM or team from having overlapping open ownership periods.
- Added a platform-owner-only identity preview API that consumes only analyzed, pending-preview mappings.
- Added a Platform Workspace identity-preview panel for entering the reviewed season key, generating the private preview, showing the 32-team roster distribution, and keeping the blocked Free Agent state visible.
- A reviewed source franchise/season key is mandatory. The API does not infer the season from unverified capture metadata.
- Blocked Free Agents produce `rostered-players-only`, a null Free Agent count, and an explicit warning that failure is not zero.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. FranchiseHQ cannot claim a complete player pool.
- The Madden payload did not provide source-franchise or season markers, so the source-lock report remains `review_required`. The route proves franchise `742482`; the owner explicitly reviewed source season `1`, display name `FGC Madden 27 · Season 1`, and season year `2026` before identity creation.
- The accepted refresh/login inconvenience remains frozen until 7.5.0.

## Validation evidence

- Migration 23 builds on a fresh database and production-shaped legacy upgrade with a continuous ledger and clean foreign keys.
- Regression coverage proves season identity uniqueness, stable player identity across seasons/team changes, person-owned GM continuity, ownership-period non-overlap, and blocked-versus-confirmed-empty Free Agent behavior.
- Source guards prove the identity preview requires platform-owner access, reads pending previews, and cannot write the active snapshot pointer.
- Live isolated-staging reconciliation proves one season, 2,044 permanent player identities, 2,044 source aliases, 2,044 season summaries, 32 private team rows, and 2,044 private player rows with zero foreign-key violations.
- The live preview records `rostered-players-only`, `free_agent_status=blocked`, and `free_agent_count=NULL`; both the API and stored rows confirm that no activation or active-snapshot change occurred.
- The consolidated strict release gate is the acceptance source for final counts.

## Deployment status

- Baseline: `codex/franchisehq-7.3.0` commit `5c062e5b91b9b7690c3717ff4fe6bef761999e48`.
- Branch `codex/franchisehq-7.3.1` was created from the exact 7.3.0 baseline after authorization.
- PR #11 is open from `codex/franchisehq-7.3.1` into `codex/franchisehq-7.3.0`; staging runtime commit `40cbc63132963a9633b85124f4ed70eb60bd90ad` has 4/4 hosted checks passing.
- Migration 23 was applied only to `franchise-hq-staging-db` after Time Travel bookmark `0000001b-00000000-000050d6-d7b3a343ba157b0b8149ee047302b36a`. Verification shows ledger 23, 66 application tables, zero foreign-key violations, and unchanged protected counts. Post-migration bookmark: `0000001b-00000002-000050d6-8e74fd51e8b1e90f9529f08fe16e6ac0`.
- Cloudflare Preview deployment `c8df85cf-f69c-41ea-b47b-ee899abdf97c` succeeded from exact runtime commit `40cbc63` at `https://c8df85cf.franchise-hq.pages.dev`.
- One simulated staging user and one temporary commissioner membership were used only in isolated staging. The same membership row was reactivated for each bounded step and is retained inactive for audit integrity.
- Three short-lived staging sessions were created during acceptance: the first request failed closed because it used the obsolete local owner selector, the corrected session completed report/classification/mapping, and the final session created the owner-confirmed identity preview. All three session rows are retained revoked; active temporary sessions and memberships both reconcile to zero.
- The authenticated analysis inspected 43/43 captures. Canonical pending-preview mappings contain 32 teams and 2,044 rostered players. Private preview run `identity_preview_d6a7ab8d-c852-42cd-9faa-03163adb07a7` contains 32 team rows and 2,044 player rows for permanent season `season_0edd7760-1fe3-4756-9b0a-fa0d9cb58d33`.
- Six membership-audit rows and six tenant-audit rows are retained across the three activate/deactivate cycles. Foreign-key violations, active staging memberships, active staging sessions, and active snapshots all reconcile to zero.
- Production, Main, data reset, import, snapshot activation, and production membership changes: not authorized and not run.

## Rollback

- Before publication, discard only the local 7.3.1 source patch; the baseline commit and all external environments remain unchanged.
- After a separately authorized migration, migration 23 is additive and should remain in the ledger during code rollback.
- Preview rows are private and inactive. Removing stored preview or identity data requires exact target review and separate authorization.

## Owner input required for the next gate

Review this isolated-staging acceptance and separately authorize 7.3.2 implementation when ready. No Production, Main, data reset, import, or snapshot-activation authorization is implied.
