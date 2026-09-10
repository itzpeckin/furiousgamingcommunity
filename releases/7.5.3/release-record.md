# FranchiseHQ 7.5.3 Release Record

## Scope

Correct the Week 10 result regression exposed by a new Production import. When a normal `/week/reg/10/schedules` route and a non-empty All Weeks `/week/reg/0/schedules` sentinel contain the same game IDs, the normal route is authoritative. The sentinel remains a fallback only when no ordinary canonical route supplies that game.

Advance the candidate mapping revision so the already retained source can be recomposed once under the corrected mapper without requesting another Madden export. Preserve normal statistic-route authority, empty Week 0 placeholder handling, blocked/null Free Agents, and the append-only snapshot/audit model.

## Added during delivery

- Production diagnosis proves the active Week 17 snapshot contains 14 Week 10 games from the sentinel route, but only 3 final scores, while ordinary Week 10 statistics routes contain records for all 28 participating teams.
- The latest schedule mapping audit records 14 ignored duplicate games, identifying the ordinary Week 10 schedule as the discarded source.
- Schedule duplicate resolution now ranks an exact nonzero canonical route above the All Weeks sentinel, independent of route arrival order.
- Candidate mapping revisioning allows one corrected recomposition of the retained source while preserving idempotency for subsequent imports.

## Known inherited blockers

None.

## Validation evidence

Focused candidate-import coverage passes, including both sentinel-first and ordinary-route-first duplicate arrival. The complete strict repository gate passes with 208 tests, 255 syntax checks, migration 37 verification, deterministic inventory, and the release contract. Hosted checks remain required before Production deployment.

## Deployment status

Owner-authorized Production hotfix. Publication, hosted validation, deployment, and retained-source recomposition remain pending.

## Rollback

Code rollback baseline is Main commit `8d08525155fdcbfdda712b03b9a0791ab462891a`. The pre-hotfix active snapshot `a07614fc-a996-467f-86c2-d87926072882`, every prior snapshot, and lifecycle audits must remain retained. Rollback must never delete or rewrite snapshots, rotate the export URL, archive/transition the season, or reinterpret blocked Free Agents.
