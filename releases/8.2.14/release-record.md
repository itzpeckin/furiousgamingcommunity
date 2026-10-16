# FranchiseHQ 8.2.14 - Season turnover and archived player statistics

## Scope

An EA offseason export contained four empty postseason bracket slots (zero home/away IDs, zero scores, status 1), which failed snapshot validation as unknown teams. Exclude only that exact unassigned postseason shape. Partial pairings, scored games, regular-season placeholders and unknown real team IDs still require validation. Increment the mapping revision so a failed candidate cannot reuse stale mapping.

Season/franchise/edition mismatches now preserve a typed error and bounded season diagnostics. If the next year is already prepared, the commissioner is told to retry after Madden advances, not archive again or disconnect. Nonretryable capture/season guards finish the job immediately instead of leaving a misleading running status. Exact new-year preseason evidence is required; no year offset, stale-schedule guess or reopening of the closed season is introduced.

Archive Season creates missing player identities and season summaries from the exact archived snapshot, including departed players retained only in statistics. Existing franchise-scoped identities and career totals are preserved. Batched writes are atomic; an alias race fails rather than assigning history to another identity. Historical statistics remain exclusively in Player Card > Statistics. Details, current-year logs, rule checks and leaderboards are unchanged.

## Added during delivery

FGC's 2027 closure recorded zero saved player summaries despite computing 977 matched player totals. Rehearsal of its frozen snapshot accounts for all 14,938 eligible player-stat rows and creates 1,854 summaries (1,125 with statistics). The authorized, additive recovery is specified separately in recovery-plan.md. The old yearly export workflow is confirmed errored while its job row still says running; only that exact stale job is eligible for cleanup.

## Known inherited blockers

The post-archive generic error discarded its original cause. The last successful hub reported 2027 offseason; the commissioner confirms Madden is now preseason Week 1. Do not claim that the exact new-season live hub has been verified. A normal fresh collection after deployment remains the live provider acceptance step.

## Validation evidence

Regression coverage includes exact placeholder exclusion and negative controls, closed-season rejection, correct 2028 preseason acceptance, missing-summary archival, departed players, franchise isolation, alias-race rollback and safe failed-job state. Recovery is rehearsed using all 15,508 retained statistic rows and 1,607 roster rows from the frozen snapshot. Strict gate, PR CI and hosted preview/production checks are required before publication.

## Deployment status

Strict gate passed 573 tests. Recovery source replay, idempotency and deliberate-failure rollback passed. Publication authorized under standing release authorization. Schema remains 54. No separate Worker or Discord change is required. Production recovery remains pending the quality gate and backup/protected-state checks.

## Rollback

Restore 8.2.13 Pages deployment dffa452f-cc29-48b6-a6b4-30943bc2000e if application rollback is necessary. Preserve recovered career summaries and active snapshot; do not restore the whole database as routine rollback. Use the narrowly scoped recovery ledger for any correction, with a new approved plan. See recovery-plan.md for stop conditions.
