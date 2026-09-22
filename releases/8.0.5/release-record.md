# FranchiseHQ 8.0.5 — Weekly import and Discord rollover integrity

Baseline: Main `dbceb78833df8d331597ae72cb1ddf102e673342` (8.0.4).

## Scope

Forward imports now combine the selected current-week report with complete, retained earlier-week route captures observed after the preceding same-season snapshot. The current week remains anchored to the selected report's proven period; schedule-only future weeks do not advance it. Route observations are bounded by the selected report time so a later export cannot silently alter an earlier candidate on retry. All captures, malformed and prior snapshots, and audits remain retained.

A populated weekly re-export replaces that period's older statistics rather than leaving stale player rows. If a same-week export contains no statistics, known live statistics are retained. An incomplete schedule capture cannot regress an already final result to 0–0. No missing or blocked Free Agent count is converted to zero.

The commissioner import button now launches the existing durable background import Workflow and polls its retained progress. Map Schedule has bounded Workflow retry, so a transient browser or edge request interruption does not terminate the import. Errors no longer blame the user's connection without evidence. The workflow uses the exact latest *passed* export report, not the timestamp of a deduplicated physical capture.

Automatic Discord schedule rollover now accepts nonterminal `{ok:false,status:'running',hasMore:true}` checkpoints and continues until all current-week threads exist and prior threads are retired. Terminal Workflow errors mark the retained sync run failed rather than leaving a misleading permanent “running” state. The importer reports league-data activation separately from Discord thread readiness.

## Added during delivery

Production read-only evidence established that FGC's live Week 5 snapshot lacks Week 4 statistics even though a retained Week 4 report contains them. The selected Week 4 backfill failed before a schedule mapping row was committed. This release addresses the systemic import and checkpoint paths; the exact live-data recovery remains a separately verified operation.

## Known inherited blockers

FGC still needs the retained Week 4 recovery after publication. EA's Madden Companion Rosters mode is unavailable for P2W's first complete live import. Neither condition justifies fabricating roster or Free Agent data.

## Validation evidence

Focused tests reproduce the Week 4 → Week 5 retained-export sequence, empty-stat/final-score preservation, exact ready-report selection, interrupted Map Schedule retry, Discord checkpoint completion, and terminal Discord failure recording. The full strict gate passes 310/310 tests plus syntax, secrets, environment, migration, inventory, and release-contract checks. Hosted checks and Production smoke verification remain pending.

## Deployment status

Candidate under validation; no Production publication or live-data operation has occurred yet.

## Rollback

No D1 migration, export URL rotation, season transition, roster reset, snapshot deletion, or Free Agent reinterpretation is included. The code deployment alone does not backfill FGC's already-missing Week 4 stats; that retained-source recovery is verified separately against the exact active snapshot and requires an authorized import operation. If rollback is needed, restore the previous Pages and Worker versions; all retained captures and snapshot/audit history remain available.
