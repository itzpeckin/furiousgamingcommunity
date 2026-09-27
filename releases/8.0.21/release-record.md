# FranchiseHQ 8.0.21 — week-advance thread cleanup

## Scope

After a proven week advance becomes live, create the complete new schedule, then delete all prior FHQ matchup threads, including those with game-result images. The behavior applies to every connected FHQ league and remains scoped to its server and tracked matchup threads.

## Added during delivery

Removed 8.0.20's result-thread archive exception. Result delivery now excludes retired thread records, preventing later statistics from trying to edit deleted Discord messages. Updated commissioner copy. Database audit rows are retained; no migration or Worker change is required.

## Known inherited blockers

None. Discord permissions and a configured schedule channel are required. Same-week refreshes do not replace the schedule; failed or unproven advances preserve prior threads. Private trade threads and unrelated Discord threads are outside cleanup.

## Validation evidence

Two regressions fail against 8.0.20 and pass after correction. The 64-test Discord and workflow suite passes, including separate connected leagues, result delivery, new-thread-before-delete ordering, retries, and no updates to deleted results. Strict and hosted release checks are recorded in the final receipt and PR.

## Deployment status

Standing release authorization applies. Candidate work performs no live import, thread deletion, data activation, or Discord post. Publication follows strict quality, CI and preview acceptance.

## Rollback

Restore v8.0.20 at 61a0efd43e71eeb339b57abea7b132889835ff4d and Pages 92ee579f-7fdf-4b62-b717-86171b7c0caa. Keep migration 49, Worker and live snapshots. Rolling code back cannot restore Discord threads already deleted by a subsequent authorized import.
