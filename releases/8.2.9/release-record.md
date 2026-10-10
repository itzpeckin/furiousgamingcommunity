# FranchiseHQ 8.2.9

## Scope

Scheduling threads use `🆚 Week # - Away Team vs. Home Team` until imported game completion changes the icon to `✅`. Linked active league commissioners, including those without assigned teams, are added to every current matchup thread along with its GMs. Verified week advances create the full new schedule before archiving and locking prior threads. Conversations remain under the Scheduling Channel's archived threads and search; no scheduling thread is deleted by this release.

## Added during delivery

Successful titles and memberships are cached to avoid repeat Discord writes on unchanged imports. Partial membership and archival failures retain successful work for retry. Labels run before same-week recap delivery. Deterministic scheduling job keys incorporate the presentation version and linked memberships, allowing completed pre-upgrade jobs to receive the update and new commissioners to be added on retry. Original snapshot evidence remains available for first-final recap detection. Historical manual scheduling commands cannot recreate or reopen retired threads. The additive migration distinguishes newly preserved history from already missing threads without relabeling legacy deleted history as retained.

## Known inherited blockers

Threads deleted by previous versions cannot be restored. Commissioners must have linked Discord accounts and permission to view the Scheduling Channel and read its message history. Discord client sidebar preferences remain user-controlled. Existing bot permissions must include Manage Threads and Send Messages in Threads. There is no new grant of server administrator permissions.

## Validation evidence

Isolated Discord handler/workflow tests cover imported final and in-progress status, repeat imports, no-team commissioners, tenant isolation, partial membership retries, permission guidance, new-week-before-archive ordering, final labels on archived games, missing threads, historical read-only behavior, active snapshot changes, and labels-before-recaps. All 551 tests and the strict quality gate passed. Migration 54 passed against staging with clean foreign keys. Hosted and production acceptance are recorded separately after publication.

## Deployment status

Candidate release; production publication is authorized after quality gates. Migration 54 adds only the thread presentation cache; apply staging and production before publishing the candidate runtime. Import, coaching, Gateway and email Workers are unchanged. No live import, game data, settings or Discord action has been performed during candidate work.

## Rollback

Keep additive migration 54. Prefer a forward repair: the 8.2.8 schedule runtime deletes prior active threads, so rolling it back restores the retired destructive behavior for future advances. Already archived rows remain inactive in 8.2.8. If rollback is necessary, pause automatic scheduling before restoring the prior Pages deployment 1ea41a24-63b3-4875-aaef-a5722655e05a. Preserve all messages and database audit rows; never drop history to roll back this release.
