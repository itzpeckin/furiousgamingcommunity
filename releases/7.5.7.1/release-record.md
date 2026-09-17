# FranchiseHQ 7.5.7.1

## Scope

Correct archived and current GM History so Madden postseason games retained after regular-season Week 18 are not counted in the regular-season record, playoff appearances are visible, and Discord shows separate Regular and Playoffs records.

## Diagnosis

Read-only Production evidence found 32 frozen 2026 GM summaries totaling 275-275-2 as regular season and zero playoff appearances or playoff results. The retained immutable source snapshot contains 285 non-preseason games: the expected 272-game regular season plus the 13-game postseason in Madden schedule Weeks 19–23. Madden retained those postseason rows with `regular-season` stage and `/week/reg/` provenance, so the original ownership freeze treated completed postseason results as regular season.

## Correction

Ownership history now treats weeks after Week 18 as postseason even when Madden retains the regular-season stage label. The same interpretation applies to ownership-period boundaries. Archived season displays are rebuilt at read time from each retained immutable source snapshot and fall back to the stored frozen row when the source is unavailable; no archived row or audit is rewritten.

Playoff appearances are derived from postseason participation even when a retained score is unavailable. Wins, losses, and ties still require a completed result. `/gm-history` now renders separate Regular and Playoffs records, and the web History Books consumes the same corrected totals.

## Added during delivery

Production read-only diagnosis was converted into a retained-snapshot reconstruction regression. The release also applies corrected Week 19+ scope to ownership-period boundaries so a GM change made during the postseason is attributed consistently.

## Known inherited blockers

Madden's explicit Free Agents route remains blocked upstream and therefore unknown/null, never zero. The Madden Companion server-load outage prevents the owner from running the next importer performance benchmark, but it does not block this retained-snapshot GM History correction.

## Validation evidence

Focused ownership and Discord regressions pass 56/56. The complete repository and strict release gates pass 256/256, including retained-snapshot reconstruction, Week 19–23 classification, mid-postseason ownership boundaries, preseason exclusion, incomplete-result handling, tenant isolation, migration immutability, and the existing import/thread safety suite.

## Deployment status

Pull request, protected Main merge, Production Pages/Worker publication, and signed-in read-only acceptance are standing-authorized. No database migration, Discord command registration, Madden export/import, snapshot activation, or Production data write is required.

## Rollback

The exact runtime baseline is Main `92d8b6326ca190fc1b926ee1e2b45ab066db8e5e`, Production release 7.5.7, and migration 43. Runtime rollback may restore that code while retaining all frozen GM summaries, ownership periods, snapshots, captures/reports, imports, schedules, audits, export URL state, Discord records, season/game-year records, and blocked/null Free Agent state.
