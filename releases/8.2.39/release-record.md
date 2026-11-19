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

Strict migration validation passed: 39 canonical migrations, 19 archived legacy files and 142 required tables. The focused backend rollover suite passed 83 tests and the final UI/related suite passed 120 tests (63 frontend and 57 related). The complete strict quality gate passed all 730 tests with zero failures, including inventory, migration and release-contract checks. The initial full run found two obsolete release-marker assertions; both were updated for 8.2.39 before the passing final run. Live 2029 activation and preservation of the 2028 archive are verified. PR quality run 44458026256 passed in 72 seconds, along with Cloudflare Pages and import-worker checks. Isolated preview deployment 23891ab7-65e6-4dd1-b7ac-f9c1556f038d passed 8.2.39 health checks with D1/R2 isolation verified. Production health returns HTTP 200 and release 8.2.39, with account email, Discord scheduling and loadout reader ready. Published JavaScript contains the recovery and prepared-season state changes; the browser shell shows 8.2.39. A fresh commissioner tab verifies Production Release 8.2.39, active Season 2029 Week 1, live snapshot, all 18 weeks and 272 games complete, Latest Export Live, captured Preseason Week 1 and the 04:15:53 UTC activation audit. No season-mismatch warning is present. Owner acceptance remains pending. Post-deployment D1 checks confirm the same active 2029 snapshot with 272 games and 2,941 players, plus the unchanged 2028 closure digest and 2,579 player summaries.

## Deployment status

The owner explicitly authorized publication with “publish it.” [PR #224](https://github.com/itzpeckin/furiousgamingcommunity/pull/224) published candidate 237c2ec22ba7cfd44f1a352611ebfe4c4e341914 and merged as Main 935e833915fcb137143414f92adf2f4e5b63c411 at 2026-11-19 04:26:01 UTC. Git-integrated Pages production deployment [3af24ab9-9072-4ea6-b683-e5cb64aad60e](https://3af24ab9.franchise-hq.pages.dev) succeeded at 04:26:23.91033 UTC and serves 8.2.39. Cloud preview and production APP_VERSION are 8.2.39. Main quality run 44458291953 also passed in 76 seconds. The application is deployed pending owner acceptance.

The immutable rollback baseline is 8.2.38, commit 8f9bff5b71a342ae3d628e3eb68640f48d6ee3ce. Schema remains 56 and no migration was required. The confirmed archive operation predates this application release. The subsequent authorized 2029 collection and automatic publication are normal commissioner operations, disclosed separately from application deployment. The application release’s dataChanged=false does not imply that those live operations made no data writes.

## Rollback

Restore the previous Git-integrated 8.2.38 application deployment and APP_VERSION=8.2.38 if required. Preserve the completed 2028 archive, active 2029 season and snapshot, career summaries and ownership carry-forward. An application rollback must not reopen 2028 or restore the whole database. See recovery-plan.md.
