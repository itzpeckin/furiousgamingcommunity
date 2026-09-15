# FranchiseHQ 7.5.6.4

## Scope

This release prepares the existing one-click **Archive Season** action for the completed 2026 franchise season and corrects contract years across FranchiseHQ and Discord. Deployment is code-only: it does not execute Archive Season, import an export, change the active snapshot, reset data, rotate the permanent export URL, alter credentials or reinterpret blocked Free Agents.

Archive Season now derives source-backed regular-season and postseason player totals from the retained active snapshot and freezes them into all existing 2026 player-season summaries. It freezes GM records from completed games and reviewed ownership periods, closes those 2026 periods, creates the 2027 season as a prepared destination, and automatically opens 2027 ownership periods for every current reviewed team assignment. Existing snapshots, raw statistics, transactions, trades, ownership, draft picks, captures, audits and memberships remain retained. The normal draft horizon opens the next class after the season boundary.

Madden's retained `contractYearsLeft` now wins over the canonical mapper's older `contract_years_remaining` value, while `contractLength` remains the total deal length. A retained 5-year-left, 6-year deal therefore renders as `5 / 6`, not `6 / 6`. The correct field already exists in retained roster records, so existing Player Cards correct after deployment without another export.

## Added during delivery

Production-scale rollover preparation replaced per-player archive statements with one bounded JSON-backed D1 update. Player summaries, GM summaries, ownership carry-forward, the 2026 closure and the prepared 2027 season now remain in one atomic batch: any failed statement rolls the full action back. The payload is rejected before writing if it exceeds D1's row/bind safety boundary.

## Known inherited blockers

Six retained historical statistic player IDs have no stable player alias and therefore cannot be safely attributed to a person. Their raw 2026 statistic records remain retained in the immutable snapshot; FranchiseHQ does not manufacture identities or discard the source rows. This does not block the 1,151 matched statistic players, GM History or 2027 preparation.

## Validation evidence

The strict repository gate passed 243 tests, including the full atomic Archive Season path, contract-years precedence, migration continuity, active-snapshot preservation, tenant isolation and blocked-Free-Agent semantics. A read-only Production preflight found active 2026 Week 23, 2,044 player-season summaries, 32 current ownership periods, 32 current team assignments, no prior season closure and no previously frozen GM summary. No Production write was made during preflight.

## Deployment status

Branch publication, hosted checks, Main merge and the code-only Production deployment are authorized and pending. Migration 41 remains current; this release adds no migration. Archive Season and the 2027 import remain separate commissioner-operated actions and have not been executed by this deployment.

## Production preflight

Read-only inspection of the correct Madden 27 Production D1 database found one active 2026 franchise season at Week 23, no closure, 2,044 player-season summaries, 32 open ownership periods and 32 active team assignments. All 2,044 summary JSON values are currently empty, which is why the old Archive Season implementation must not be used before this release. The retained statistics contain 1,157 player source IDs; 1,151 have stable roster identities. The six unmatched historical players remain preserved in the immutable snapshot rather than being assigned manufactured identities.

## Commissioner sequence after deployment

1. Confirm Production displays 7.5.6.4 and the completed 2026 snapshot remains active.
2. In Commish HQ, click **Archive Season** once. Do not run a 2027 import first.
3. Verify the result reports 2027 prepared, player totals frozen, GM summaries frozen, 32 assignments carried forward, and the next draft-pick class available. The permanent export URL and active 2026 snapshot remain unchanged.
4. From Madden's 2027 Week 1, send League Info, Rosters and current Weekly Stats/Schedule data through the same permanent export URL.
5. Click **Import Latest Export** once. The validated 2027 candidate then becomes active atomically; retained 2026 history stays archived.

## Rollback

Pre-release Main is `abb342f03525221a238a869938fb2cebd0c86761`. Code rollback does not authorize reverting a completed season closure. If Archive Season has not been executed, ordinary code rollback is safe. If it has been executed, use a forward correction and retained closure/audit evidence; do not reset D1 or delete the prepared 2027 season.
