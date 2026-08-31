# FranchiseHQ 7.3.7 Release Record

**Status:** Validated local review candidate

**Production changed:** No. Production remains on accepted 7.3.6 commit `fd0458223f903da5533fec9c1b84ce69c7c4a19a`, migration 26, Pages deployment `3138d4d2-d1f7-498e-a15d-89bdb6bdd162`, and active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`.

## Scope

Deliver 7.3.7 ownership reconciliation, My Team GM history, and trophy cases using reviewed FranchiseHQ memberships as the only ownership authority. Fold the owner-requested player experience work into the same release: immediate first player-card opening, exact-origin return, portrait-phone table scrolling, scrollable player Game Logs, Jets/Rams logo contrast, and defensive game-log coverage for EDGE and linebacker roles.

## Added during delivery

- A hydrated roster player opens synchronously while the full player directory and 6,966-row statistics set prewarm in the background; game-log surfaces repaint when statistics arrive.
- Every player entry point retains its exact origin route, and closing the shared card returns to the team roster, My Team, Players, Stats & Leaders, Home, or other originating surface.
- Portrait-phone roster, player-directory, and leader tables remain real horizontally scrollable tables instead of collapsing each row into vertical data-label cards. The separate Game Logs tab has its own bounded vertical and horizontal scroll region.
- Jets and Rams marks receive team-specific opacity, shadow, and outline definition in team banners and player-card heroes.
- LEDGE, REDGE, EDGE, SAM, MIKE, WILL, and canonical defensive aliases expose TKL, TFL, SACK, INT, FF, FR, and TD game-log columns.
- Additive migration 27 makes ownership boundaries season/week scoped, adds frozen GM season summaries, and automatically baselines existing active reviewed team assignments so commissioners do not face a second initialization step. Later membership changes open and close ownership periods atomically with the assignment write.
- My Team and team roster pages expose person-owned career totals, teams managed, regular/playoff records, playoff appearances, conference championships, Super Bowl appearances, and championships. Madden owner-name fields are not read or inferred.
- Archive Season now includes GM summary freezing in the existing one-action archive transaction; no archive was run during candidate work.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. Its count remains unknown/null, never zero.
- The broader 7.5.0 session framework remains scheduled even though accepted 7.3.6 runtime work removed the observed refresh/login restart.

## Validation evidence

- The full baseline gate covers syntax, repository contracts, assets, secret scanning, environment separation, migration continuity, release evidence, inventory, authorization, tenant boundaries, session behavior, imports, game-year transitions, permanent identities, and live-data behavior.
- Focused 7.3.7 tests prove ownership attribution without Madden owner names, week/season cutoff behavior, instant-card and return-route contracts, phone table layout, Game Logs scrolling, logo targeting, and requested defensive roles/stat columns.
- Fresh and production-shaped databases reach migration 27 with 80 required tables and zero foreign-key violations. Runtime schema checks fail closed below version 27.
- Local candidate work created no Production identity, ownership, audit, import, candidate, activation, archive, reset, transition, export, or credential row. A future authorized migration 27 will create only the GM identities and opening ownership periods derived from existing active reviewed memberships.

## Deployment status

- The exact candidate has not yet been published, merged to Main, migrated, or deployed.
- Migration 27 must be applied before the 7.3.7 runtime because membership assignment handlers intentionally require the new ownership-period columns.
- Production application publication and migration remain separate recorded gates. No staging run is required by this local candidate.

## Rollback

- Before publication, discard only the unmerged candidate; Production remains unchanged.
- After a future accepted deployment, runtime rollback restores accepted 7.3.6 commit `fd0458223f903da5533fec9c1b84ce69c7c4a19a` and Pages deployment `3138d4d2-d1f7-498e-a15d-89bdb6bdd162` while retaining additive migration 27 and every GM identity, ownership period, season summary, audit, membership, and snapshot row.
- Never drop migration 27, rewrite ownership history, move the active snapshot, reset/import data, run Archive Season, rotate the export URL, or reinterpret blocked Free Agents as zero as part of runtime rollback.
