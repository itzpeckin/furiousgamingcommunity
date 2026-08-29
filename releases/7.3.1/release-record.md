# FranchiseHQ 7.3.1 Release Record

**Status:** Isolated-staging candidate; permanent identity and private preview UI are deployed, while authenticated report/mapping remains blocked by the empty staging identity set

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

- The staging report still requires an authenticated commissioner/platform-owner to select “Analyze Captured Export.” Staging currently has zero users and memberships, so a separately authorized staging-only identity bootstrap is required first.
- Madden's explicit Free Agent route remains blocked upstream. FranchiseHQ cannot claim a complete player pool.
- The accepted refresh/login inconvenience remains frozen until 7.5.0.
- No live private preview run or staging membership bootstrap has been authorized or performed.

## Validation evidence

- Migration 23 builds on a fresh database and production-shaped legacy upgrade with a continuous ledger and clean foreign keys.
- Regression coverage proves season identity uniqueness, stable player identity across seasons/team changes, person-owned GM continuity, ownership-period non-overlap, and blocked-versus-confirmed-empty Free Agent behavior.
- Source guards prove the identity preview requires platform-owner access, reads pending previews, and cannot write the active snapshot pointer.
- The consolidated strict release gate is the acceptance source for final counts.

## Deployment status

- Baseline: `codex/franchisehq-7.3.0` commit `5c062e5b91b9b7690c3717ff4fe6bef761999e48`.
- Branch `codex/franchisehq-7.3.1` was created from the exact 7.3.0 baseline after authorization.
- PR #11 is open from `codex/franchisehq-7.3.1` into `codex/franchisehq-7.3.0`; exact UI candidate commit `5742bd735e1f8d0e17901aaeb1134c22a668c4f3` has 4/4 hosted checks passing.
- Migration 23 was applied only to `franchise-hq-staging-db` after Time Travel bookmark `0000001b-00000000-000050d6-d7b3a343ba157b0b8149ee047302b36a`. Verification shows ledger 23, 66 application tables, zero foreign-key violations, and unchanged protected counts. Post-migration bookmark: `0000001b-00000002-000050d6-8e74fd51e8b1e90f9529f08fe16e6ac0`.
- Cloudflare Preview deployment `c6a30d62-f254-47e8-a954-58e5d6797164` succeeded from exact commit `5742bd7` at `https://c6a30d62.franchise-hq.pages.dev`.
- The authenticated report and identity-preview actions were not run. Staging has one league, zero users, zero memberships, and zero active snapshots; no identity or membership data was inferred or changed.
- Production, Main, data reset, import, snapshot activation, and membership changes: not authorized and not run.

## Rollback

- Before publication, discard only the local 7.3.1 source patch; the baseline commit and all external environments remain unchanged.
- After a separately authorized migration, migration 23 is additive and should remain in the ledger during code rollback.
- Preview rows are private and inactive. Removing stored preview or identity data requires exact target review and separate authorization.

## Owner input required for the next gate

Separately authorize a staging-only commissioner/platform-owner identity bootstrap. That owner can select “Analyze Captured Export,” map teams and rostered players, enter the reviewed season key, and generate the private 32-team/2,044-player preview. No production authorization is implied.
