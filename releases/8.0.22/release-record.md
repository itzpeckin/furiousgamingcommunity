# FranchiseHQ 8.0.22 — season-wide rushing audit

## Scope

`/rush rule` now checks every completed regular-season game in the active imported season when no week is supplied. Earlier-week violations remain visible after the league advances. Explicit `week` remains supported. Each finding includes its week.

## Added during delivery

The audit reads every statistics page instead of stopping after 20,000 records. It retains only relevant rushing and team-game rows and indexes them by week/team to bound memory and avoid repeated full-season scans. Long reports use the optional `page` parameter, stay within Discord message limits, and show complete summary counts. Missing statistics remain unverified, never zero carries.

## Known inherited blockers

None for this repair. Coaching screenshot compliance is a separate unfinished feature: icon-only identification did not pass the supplied-image feasibility test. This release does not expose or enable a screenshot checker.

## Validation evidence

Four targeted tests passed: signed season-default interaction with older week, other-season and other-league exclusions; explicit week filtering; more than 20,000 statistics; and a 576-team-result report whose pages retain every result within Discord limits. Strict, CI and hosted results are recorded in the final release receipt.

## Deployment status

Standing release authorization applies. No migration or Import Worker change. No import, season archive, thread change, live Discord message or active-data mutation is required. Command registration updates the optional page argument and help text.

## Rollback

Restore v8.0.21 at 13f46e30c796b857ee5b7f1a31532abdbe9e7d98 and Pages ca1b2794-47f2-41ca-99ac-97cb24a949d3. Keep migration 49, Import Worker and live snapshots. Restore the previous command definitions if reverting the page option.
