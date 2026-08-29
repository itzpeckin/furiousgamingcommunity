# FranchiseHQ 7.3.1 Release Record

**Status:** Local implementation candidate; permanent identity and private preview are implemented but have not been deployed or run against staging capture data

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
- A reviewed source franchise/season key is mandatory. The API does not infer the season from unverified capture metadata.
- Blocked Free Agents produce `rostered-players-only`, a null Free Agent count, and an explicit warning that failure is not zero.

## Known inherited blockers

- The staging report still requires an authenticated commissioner/platform-owner to select “Analyze Captured Export.”
- Madden's explicit Free Agent route remains blocked upstream. FranchiseHQ cannot claim a complete player pool.
- The accepted refresh/login inconvenience remains frozen until 7.5.0.
- No 7.3.1 isolated-staging migration/deployment or live private preview run has been authorized.

## Validation evidence

- Migration 23 builds on a fresh database and production-shaped legacy upgrade with a continuous ledger and clean foreign keys.
- Regression coverage proves season identity uniqueness, stable player identity across seasons/team changes, person-owned GM continuity, ownership-period non-overlap, and blocked-versus-confirmed-empty Free Agent behavior.
- Source guards prove the identity preview requires platform-owner access, reads pending previews, and cannot write the active snapshot pointer.
- The consolidated strict release gate is the acceptance source for final counts.

## Deployment status

- Baseline: `codex/franchisehq-7.3.0` commit `5c062e5b91b9b7690c3717ff4fe6bef761999e48`.
- Branch `codex/franchisehq-7.3.1` was created from the exact 7.3.0 baseline after authorization.
- Commit, push, staging migration 23, staging deployment, and live private preview are authorized and pending execution; Main remains excluded.
- Production, Main, data reset, import, snapshot activation, and membership changes: not authorized and not run.

## Rollback

- Before publication, discard only the local 7.3.1 source patch; the baseline commit and all external environments remain unchanged.
- After a separately authorized migration, migration 23 is additive and should remain in the ledger during code rollback.
- Preview rows are private and inactive. Removing stored preview or identity data requires exact target review and separate authorization.

## Owner input required for the next gate

Use an authenticated commissioner/platform-owner session in isolated staging to select “Analyze Captured Export.” Then separately review and authorize the exact 7.3.1 commit, migration 23 staging plan, isolated Preview deployment, and private 32-team/2,044-player preview run. No production authorization is implied.
