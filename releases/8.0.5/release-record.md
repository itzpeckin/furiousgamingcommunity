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

EA's Madden Companion Rosters mode is unavailable for P2W's first complete live import. That does not justify fabricating roster or Free Agent data. Automatic Discord rollover passed regression tests, but its next real week-advance event has not yet occurred in Production and remains an operational acceptance check.

## Validation evidence

Focused tests reproduce the Week 4 → Week 5 retained-export sequence, empty-stat/final-score preservation, exact ready-report selection, interrupted Map Schedule retry, Discord checkpoint completion, and terminal Discord failure recording. The full strict gate passed 310/310 tests plus syntax, secrets, environment, migration, inventory, and release-contract checks. PR #148 quality run `35756137272`, Main quality run `35756527727`, and Main Pages workflow `35756526816` passed. Signed-in Production showed release 8.0.5 and completed the protected retained Week 4 import in 147.55 seconds.

## Deployment status

PR #148 merged exact implementation `b118d39bbb7cd93d954ab56743ea52ace779ca95` into Main `e77924337e258b2a5956722febc8573146ca051f`. Pages deployment `d60dc4e2-d3a5-42d0-9b79-7941730d5228` and Worker deployment `7ca0af36-3553-4ccc-b205-c6806274e3ee` (version `2bc6c1dd-a479-4ad3-a129-efb0fb2078ca`, 100% traffic) succeeded. No migration was added or applied.

The protected FGC recovery used the already-retained Week 4 report; it did not request another export. Candidate `candidate_import_61a09980-e200-40f8-a0ae-696d02f386aa` validated and atomically activated snapshot `3dc6ae96-117a-4c54-9bb0-52e688808942` from previous live snapshot `434c2d1c-c6d1-4e62-b82f-1c7730655837`. Production now has 843 Week 4 statistics, 16 Week 4 games with nonzero final scores, 3,359 total statistics, all 272 regular-season games, and still shows 2027 Week 5. It retains 2,046 players, 32 teams, 16 active Week 5 threads, and archived Week 1–4 threads. Free Agents remain `blocked` with a null count. The prior snapshot, earlier failed candidate, captures, and audits were not deleted.

## Rollback

No D1 migration, export URL rotation, season transition, roster reset, snapshot deletion, or Free Agent reinterpretation is included. Code rollback does not roll back the successfully activated Week 4 backfill. If runtime rollback is needed, restore the previous Pages and Worker versions while retaining the current and prior snapshots, all captures, and audit history; any live-pointer recovery is a separate reviewed operation.
