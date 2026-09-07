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

This is a local validated review candidate. GitHub publication, pull request, Main merge, Production deployment, and the retained 51-route report reanalysis are not yet authorized. No migration is required.

## Required Production acceptance after explicit authorization

1. Deploy the exact candidate after hosted checks and Main merge.
2. Reanalyze retained session `m27_auto_39a85602e04bd654a9c2da4a581076e3` once under the new policy.
3. Verify the same retained report is latest-ready and **Import Latest Export** is enabled.
4. Verify the active snapshot is still `31b52bdc-ce62-479e-83c3-36a75eeb2b12` at Regular Season Week 13.
5. Leave the actual import/atomic activation for the commissioner's explicit button click.

## Rollback

Redeploy exact 7.4.4.6 Main merge `e2f596dd9cbc8f0f5f3086e65c6f1cb15aeb6d91`. Migration 35 remains current. Preserve all captures, reports, snapshots, audit history, the permanent export URL, and blocked/null Free Agent evidence.
