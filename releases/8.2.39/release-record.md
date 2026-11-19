# FranchiseHQ 8.2.39 — Season rollover recovery guidance

## Scope

Repair the commissioner experience when FranchiseHQ has archived one season and prepared the next but EA still exports the archived season. Keep exact source-season validation and closed-season protection. Explain which system is ready, which system is behind, and the action required before the next import can succeed. A mismatched 2028 export must never be relabeled as the prepared 2029 season. Prepared-season archive cards show the archived and prepared years, explain why old imported data remains visible, and disable repeat archival while awaiting the first live import. Successful import refreshes that state.

EA recovery displays the prepared/reported years and a numbered commissioner checklist, links to the schedule step, and includes bounded season diagnostics in support details. After Import Season Schedule, the commissioner continues through Collect League Update, Refresh, and Import Latest Export. Typed recovery details are preserved through the server and browser error paths.

## Added during delivery

Live diagnosis confirms that the 2028 archive completed at 2026-11-19 03:56:52 UTC with 2,579 player summaries, 36 GM summaries and 32 team assignments carried forward. FranchiseHQ prepared 2029 in preview with source season ID 4. The initial yearly attempt failed with EA_SEASON_MISMATCH because EA returned 2028 offseason Week 16 and no source season ID. This is evidence of a provider-season mismatch, not evidence that the 2028 archive failed.

Commissioner recovery must direct the user to advance the same franchise into 2029 preseason in Madden, then run Import Season Schedule. If Madden already shows 2029, retry Import Season Schedule once; if EA still returns 2028, contact support with the error details. Do not archive 2028 again or change the linked franchise to bypass the guard.

## Known inherited blockers

A fresh authorized Import Season Schedule attempt completed successfully after EA advanced. It verified source season ID 4, 2029 preseason Week 1, all 18 schedule weeks with 272 games, complete rosters and 1,121 located Free Agents; all 54 captures were retained and accepted. The automatic publication workflow activated snapshot 2eaed956-20be-45cb-90ae-4c20e54a304b for 2029 Week 1 with 272 games, 2,941 players and zero preseason statistics. Candidate candidate_import_cbbe66ec-baf4-451c-886c-9395a010989a records the same active snapshot afterward. Season 2029 is active and 2028 remains closed; the 2028 closure digest is unchanged at 8ba04c2e499db1cd0f7256a4a54bf910d237c12deb5559e79488b5a95b6bbb8a, preserving its 2,579 player summaries and 38 ownership periods. The live season rollover incident is resolved. The application fix cannot advance Madden or turn an old-season export into a new-season export.

## Validation evidence

Strict migration validation passed: 39 canonical migrations, 19 archived legacy files and 142 required tables. The focused backend rollover suite passed 83 tests and the final UI/related suite passed 120 tests (63 frontend and 57 related). The complete strict quality gate passed all 730 tests with zero failures, including inventory, migration and release-contract checks. The initial full run found two obsolete release-marker assertions; both were updated for 8.2.39 before the passing final run. Live 2029 activation and preservation of the 2028 archive are verified. Hosted preview and application production deployment are pending. Update validation-evidence.json with observed results; do not infer a successful check from implementation completion.

## Deployment status

The application is a validated review candidate authorized by the user's requested repair. The application candidate is based on production release 8.2.38, commit 8f9bff5b71a342ae3d628e3eb68640f48d6ee3ce. No 8.2.39 application production deployment is claimed. Cloud preview and production APP_VERSION variables are prepared at 8.2.39 for the next deployment. Schema remains 56 and this release requires no migration. The confirmed archive operation predates this application candidate. The subsequent authorized 2029 collection and automatic publication are normal commissioner operations, disclosed separately from candidate code changes. The application candidate’s dataChanged=false does not imply that those live operations made no data writes.

## Rollback

Restore the previous Git-integrated 8.2.38 application deployment and APP_VERSION=8.2.38 if required. Preserve the completed 2028 archive, active 2029 season and snapshot, career summaries and ownership carry-forward. An application rollback must not reopen 2028 or restore the whole database. See recovery-plan.md.
