# FranchiseHQ 7.4.4.7 Release Record

## Scope

Restore the commissioner **Import Latest Export** action when one retained same-season export contains more than one complete Madden week. This is a source-readiness remediation only; it does not run the import or activate a snapshot.

## Root cause

The newest Production export is a complete 51-route cohort. It contains required team, roster, player, standings, schedule, and statistic data for Regular Season Weeks 11 and 13, plus Madden's explicitly blocked Free Agent route. The discovery source gate treated two observed week values as ambiguous even though the candidate importer already supports composing multiple periods. That left the latest report in `review_required` and correctly disabled the button under the old policy.

## Added during delivery

- A versioned `same-season-complete-periods-v1` analysis policy accepts multiple observed weeks only when every observed canonical period has both schedule and statistics route authority.
- Incomplete mixtures, stray week markers, invalid week values, missing schedules, and missing statistics remain stopped for commissioner review.
- A retained report created under an older policy is reanalyzed once after the new code is deployed. A current-policy report is reused normally, preventing repeated writes.
- Reanalysis can update discovery report, discovery session, and permanent-endpoint readiness pointers only. It cannot import data or write `league_active_snapshots`.
- Blocked Madden Free Agents remain `blocked`, their count remains `null`, and rostered-player-only readiness remains explicit.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count is unknown/null and this release does not interpret it as zero.

## Validation evidence

Focused import, permanent-export, route, and Commissioner tests pass. Coverage includes complete and incomplete multi-period sources, the Production-shaped 32-team/2,044-player roster, blocked Free Agents, analysis-policy invalidation, source sanitization, and active-snapshot write exclusion. The full strict repository gate is recorded in `validation-evidence.json`.

## Deployment status

Exact candidate `b6db44250b973b1c7988ebe4989e3092bbd2a7bb` was published through PR #50 after all four candidate checks passed. PR #50 merged to Main as `cbaf0ea51dada3614f8eed2c86ab21b994be42be`; all five Main quality, build, and deployment checks passed. Cloudflare Pages Production deployment `aa809a9e-8249-4c83-80b8-b85be5b27d43` is live at `franchisehq.app`, and the exact-candidate import Worker build `5fc04676-f061-4c43-bbf8-64868da01abd` produced version `fa088c99-0417-425d-be3d-3faf3db4e96b` without enabling a public Worker route. No migration was required; migration 35 remains current.

The authorized one-time reanalysis reused retained session `m27_auto_39a85602e04bd654a9c2da4a581076e3` and report `m27_report_70298e54-beb9-4277-ae79-252801a743b3`. The report now uses `same-season-complete-periods-v1`, recognizes complete Regular Season Week 13 and Week 11 schedule/statistic authority, and is the endpoint's latest-ready report. The authenticated Production UI reports **Ready to import**, exposes an enabled **Import Latest Export** action, and continues to display Free Agents as unknown.

Read-only Production verification confirms the active snapshot remains `31b52bdc-ce62-479e-83c3-36a75eeb2b12` at Season 2026, Regular Season Week 13. No candidate-import run exists for the retained session. The permanent endpoint remains active at token version 1 with no rotation timestamp, all 14 snapshots remain retained, and foreign-key violations remain zero. The commissioner has not imported or activated the retained export.

## Commissioner next action

Open **Commish HQ → League Data** and select **Import Latest Export** when ready to validate and atomically make this retained export live. That commissioner click remains a separate data operation and was not performed during this release cycle.

## Rollback

Redeploy exact 7.4.4.6 Main merge `e2f596dd9cbc8f0f5f3086e65c6f1cb15aeb6d91`. Migration 35 remains current. Preserve all captures, reports, snapshots, audit history, the permanent export URL, and blocked/null Free Agent evidence.
