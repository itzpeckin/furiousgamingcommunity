# FranchiseHQ 7.4.0.1 Release Record

**Status:** Production deployed and verified; retained Week 10 source remains incomplete

**Production changed:** Yes, within the authorized code-only remediation scope. Exact implementation commit `900f63ac5e148447246c97869f383a56ec0e4e7b` is merged to Main as `f04a41529fa901836ef7d49adf8789a281b7626f` and live as Pages deployment `61151621-9121-4469-a3b0-ee67832d4b4d`. The retained-source check did not import or activate a snapshot; the live week remains Week 9.

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

The strict 146-test gate passed with 221 JavaScript modules, 553 inventoried files, 69 routes, 90 required tables, and zero failures. PR #32 published the exact implementation commit and passed 4/4 pull-request checks. Main merge `f04a41529fa901836ef7d49adf8789a281b7626f` passed all five Main/build/deployment checks. Production reports release 7.4.0.1 on Pages deployment `61151621-9121-4469-a3b0-ee67832d4b4d`; migration 28 remains current and no migration ran.

The authorized Production reanalysis inspected the retained 8/31/2026 10:39:21 PM source. It contains 35 routes, 32 teams, and 2,038 rostered players, but no current-week schedule route, no current-week Weekly Stats routes, and no authoritative Week 10 marker. It therefore remains **Review required** with captured week unknown. No compatible retained route fragments existed to complete it, so another Companion export using the same permanent URL is required. The commissioner should send League Info, Rosters, and Weekly Stats again; once those routes arrive, the six-hour cohort and explicit-empty-stat handling can make the source eligible without inventing data.

No candidate import, activation, reset, Archive Season, game-year transition, URL rotation, membership/credential change, or staging run occurred. The live week remains Week 9 and blocked Madden Free Agents remain unknown/null.

## Rollback

Restore the accepted 7.4.0 Main runtime and Pages deployment `03c111d0-a4d9-458e-b91c-9ece937016d0`. Retain all discovery captures, session/report/link rows, and audit evidence. Rollback must not import data, move the active snapshot, rotate the export URL, or delete retained source evidence.
