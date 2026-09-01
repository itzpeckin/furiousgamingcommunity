# FranchiseHQ 7.4.0.1 Release Record

**Status:** Locally validated Production-authorized candidate

**Production changed:** Not yet. Production remains on 7.4.0 with active Week 9 snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`.

## Scope

Repair the permanent Madden export lifecycle so League Info, Rosters, and Weekly Stats delivered as adjacent phases remain one source revision. Repeated routes retain only the newest immutable capture for that revision. A newly advanced week may be source-ready when every Weekly Stats route is explicitly captured with zero records; missing Weekly Stats routes remain a blocking error.

## Added during delivery

Automatic retained-partial stitching, newest-route selection, explicit-empty Weekly Stats readiness, rejected-source diagnostics, and unambiguous last-ready import labeling are included.

## Retained Week 10 behavior

- A bounded six-hour recovery window may combine only recent `open` or `review_required` partial sessions for the same league.
- Cross-week or cross-stage marker conflicts refuse automatic stitching.
- The newest capture per normalized route is selected, producing one deterministic stitched session and report.
- The eligible report pointer advances only if the combined source passes the complete source-readiness contract.
- Retained-capture reanalysis may create discovery-session, report, link, and audit rows. It cannot import data or move the active snapshot.

## Commissioner experience

Commissioner HQ shows concrete missing-source diagnostics for the newest rejected export. The separate history panel is labeled as the last ready import so its previous `9 / 9` result cannot be mistaken for the rejected Week 10 attempt.

## Boundaries

No migration, staging deployment, candidate import, snapshot activation, data reset, season archive, game-year transition, export URL rotation, credential or membership change, or Free Agent reinterpretation is included. Blocked Madden Free Agents remain unknown/null.

## Known inherited blockers

Madden's explicit Free Agent roster remains blocked upstream. Its count remains unknown/null, never zero.

## Validation evidence

Focused tests cover phased cohort continuity, newest-route replacement, cross-week rejection, explicit-empty Weekly Stats readiness, deterministic retained-session stitching, audit evidence, unchanged active snapshots, and blocked/null Free Agent semantics. The consolidated strict gate and hosted checks must pass before Production deployment.

## Deployment status

The strict 146-test gate passed with 221 JavaScript modules, 553 inventoried files, 69 routes, 90 required tables, and zero failures. Publication and Production deployment remain pending. Production remains on 7.4.0 and migration 28; the active Week 9 snapshot is unchanged.

## Rollback

Restore the accepted 7.4.0 Main runtime and Pages deployment `03c111d0-a4d9-458e-b91c-9ece937016d0`. Retain all discovery captures, stitched session/report/link rows, and audit evidence. Rollback must not import data, move the active snapshot, rotate the export URL, or delete retained source evidence.
