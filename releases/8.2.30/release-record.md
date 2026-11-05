# FranchiseHQ 8.2.30

## Scope

New game scheduling threads include both teams' current imported records and playoff-status icons in their opening bot post. Thread names retain only the existing played/unplayed icon, week and team names. Owner mentions and the schedule link are retained.

## Added during delivery

Scheduling loads standings with the existing teams/games read, calculates team summaries once per sync request and reuses the record-only playoff calculation used by Discord's schedule/elimination views. Green means clinched, red eliminated, white still in contention. A short legend explains these indicators. Incomplete conference evidence shows unknown rather than proving a false clinch; missing records are explicitly unavailable. Ties are preserved. This is shared platform behavior for every league.

No extra Discord messages or requests are introduced. Existing opening posts are not retroactively edited; the new presentation applies when a thread's opening post is created. Current thread names, lifecycle, member subscriptions and archival remain unchanged. This does not introduce additional tiebreaker-based playoff calculations.

## Known inherited blockers

No live Discord test messages will be posted during release validation. Real delivery will be observed during normal commissioner scheduling activity.

## Validation evidence

Three focused tests passed, including signed interaction through the actual scheduling handler with isolated database and simulated Discord responses. All 695 automated tests and strict migration checks passed. Hosted checks are required before publication.

## Deployment status

Authorized candidate. Schema 56 and separate Workers unchanged. No live imports, exports, thread mutations or customer data edits.

## Rollback

Restore Pages 8.2.29 deployment d362fd97-83ca-4b06-b468-b737643333ce. No database or separate Worker rollback. Preserve existing Discord conversations.
