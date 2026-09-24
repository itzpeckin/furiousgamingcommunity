# FranchiseHQ 8.0.9 — Multi-week payload-period import correction

Baseline: Main `e63dadf19ef2f06f152f4a7e9c713fa3cd15036f` (8.0.8.1).

## Scope

One commissioner import may contain the completed prior week plus the newly advanced current week. Madden can reuse the same `/week/reg/0/` schedule and statistics URLs for both exports, with the real week carried by each non-empty payload. FranchiseHQ's source analyzer retained that distinction, but later retained-source and mapper stages collapsed captures by URL and could discard one week.

8.0.9 treats the payload-proven period as part of retained capture identity. The exact selected captures for every complete period are carried through schedule and statistics mapping, both weeks are composed into the candidate, and the current-period proof remains the newer week.

## Added during delivery

- Incremented the candidate mapping revision so an incomplete candidate produced by the earlier URL-only behavior cannot be reused.
- Added a regression using consecutive Week 4 and Week 5 payloads on identical Week 0 schedule/statistics URLs.
- Added mapper regressions proving both exact schedule captures survive and statistics deduplicate only within the same route-plus-period.
- Preserved ordinary nonzero weekly-route authority and the existing harmless handling of empty Week 0 placeholders.

## Known inherited blockers

EA's Madden Companion roster-export availability remains outside FranchiseHQ control. P2W cannot establish its first full roster baseline until that source is restored or another reviewed roster authority is approved.

## Validation evidence

Focused importer coverage passes the exact duplicate-URL two-week scenario, current-period authority, ordinary route precedence, historical carry-forward, empty placeholder behavior, and blocked Free Agent semantics. The complete strict repository gate passes all 312 tests, 667 tracked-file checks, and 87 route checks.

## Deployment status

Production publication is authorized. Pull-request publication, hosted checks, Main merge, Production deployment, and live release verification remain pending. Deployment does not run a Madden import or alter live league data.

## Rollback

Application rollback returns to exact Main `e63dadf` while retaining every capture, report, candidate, snapshot, audit, active pointer, Discord record, and permanent export URL. No D1 migration is included. Rollback must not reset, delete, archive, transition, rotate credentials, or reinterpret blocked/null Free Agents.
