# FranchiseHQ 7.5.9

## Scope

Complete roadmap stages 7.5.8 and 7.5.9 as one release: make the active server snapshot the season/week authority everywhere, remove silent browser/demo authority fallbacks, expose commissioner operations health, and add tenant-safe monitoring, throttling, backup evidence, reconciliation, and incident procedures.

## Added during delivery

- Added one server-computed snapshot/season/stage/week context and standardized live, empty, stale, and incomplete data status.
- Routed League Home, Teams, Schedule, Statistics, Standings, player surfaces, and Commissioner HQ through the same active-snapshot authority.
- Added Commissioner HQ checks for snapshot counts, importer progress, Discord delivery, schema level, and recovery evidence.
- Added sanitized structured request outcomes, request/release/timing headers, redacted route templates, and bounded D1-backed league mutation budgets.
- Added migration 44's tenant-scoped operational and recovery evidence without changing existing league data.
- Added exact-target D1 bookmark and reconciliation tooling plus local backup/restore and mismatch regressions.
- Added an operations, incident, secret, dependency, and recovery runbook.

## Known inherited blockers

Madden's explicit Free Agents route may remain blocked upstream. FranchiseHQ preserves blocked or missing Free Agent authority as unknown/null, never zero. Cloudflare Time Travel is the short-window disaster-recovery authority; an actual restore overwrites the selected database and therefore remains a separate incident action, not an automatic release step.

## Validation evidence

The strict gate covers canonical context, stale/incomplete state, migration continuity through 44, legacy-data preservation, local backup/restore, active-snapshot reconciliation, sanitized route logs, bounded writes, tenant boundaries, Commissioner HQ, imports, Discord, trades, transactions, mobile behavior, secrets, assets, and release contracts. Production migration and reconciliation results are recorded after the exact candidate passes hosted checks.

## Deployment status

Pull request, protected Main merge, additive migration 44, exact Production deployment, and read-only recovery reconciliation are standing-authorized for this release. No Madden export/import, active-snapshot change, reset/delete, export-URL rotation, season archive/transition, Discord scheduling action, roster/ownership change, or Free Agent reinterpretation is included.

## Rollback

Restore the prior application runtime at exact Main `c02064e5ce690df1314735cb4489bf32d3a7a5b0` / FranchiseHQ 7.5.7.7 while retaining forward-compatible migration 44 and every row. Do not drop the new evidence tables, restore a D1 bookmark, move the active snapshot, delete or reset data, rotate the export URL, archive/transition a season, change Discord state, or reinterpret blocked/missing Free Agents. A D1 restore requires a separately reviewed incident decision and post-restore reconciliation.
