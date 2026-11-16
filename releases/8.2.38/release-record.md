# FranchiseHQ 8.2.38 — Accurate loadout report context

## Scope

Preserve per-ability, playsheet and duplicate-check results when a submission cannot count because of its author or matchup. Previously the assignment override discarded the complete rules result, making all six identified abilities appear unresolved and all four identified playsheets appear unreadable. Linked owners posting in another matchup now receive Wrong matchup thread, accurate matchup/destination guidance, and an overall NOT COUNTED status. Missing links retain Team link needed. Neither case earns a matchup approval.

## Added during delivery

Report version m27-loadout-report-2 marks completed deliveries. The normal scanner refreshes older current-week reports using cached image observations and edits the existing Discord reply once. Reader version remains m27-glyph-reader-4; no additional image-provider call is needed. Pending report counts include stale report versions.

## Known inherited blockers

None for this report correction. Archived threads remain excluded. Tampa Bay has no active matchup in the current schedule, so the reported submission in Raiders–Jaguars remains unassigned and is not counted for either participant.

## Validation evidence

27 focused tests pass, including the reported six-ability/four-playsheet pattern, missing-team identity with a visible violation, and a report upgrade that edits the existing reply exactly once without rereading the image. All 722 tests and the full strict gate pass. A replay of the exact saved production observation returns six legal abilities, four legal playsheets, no duplicates and an overall NOT COUNTED — WRONG MATCHUP THREAD report. Hosted checks are pending.

## Deployment status

Publish the accepted Pages candidate after local/hosted checks and isolated preview acceptance. No scanner Worker, schema, credentials, rules, membership or snapshot changes are required. Verify that submission 1572011817734115368 retains its complete reader-4 observation, updates the existing report 1572011867872694369, and remains unassigned with an accurate reason. Verification uses read-only database queries; the deployed scanner performs the normal report refresh.

## Rollback

Restore Pages deployment b8a8cd2e-162b-44f1-b50f-032e98f9e2fe at source 3f578da76cf3eda6bb202a6dd85595bce15c21ff (v8.2.37) and APP_VERSION=8.2.37. Keep reader version 4 and scanner Worker b2807035-e0a1-4058-95a0-56ac5be6b5fc. Existing report history is preserved; no data rollback is required.
