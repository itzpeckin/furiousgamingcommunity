# FranchiseHQ 7.5.7.3

## Scope

Allow commissioners to import complete League Info and Weekly Stats when Madden does not export Rosters, provided a populated, validated snapshot for the exact active game year and franchise season is already live.

## Added during delivery

The import analyzer, candidate builder, player mapper, snapshot manifest, commissioner status panel, and audit trail now share one guarded roster-carry-forward contract. A qualifying import creates a new auditable player mapping run by copying the active snapshot's complete player source instead of treating a missing roster export as an empty roster.

## Safety behavior

- The season's first snapshot still requires complete Rosters.
- Partial roster exports never qualify for carry-forward.
- Players, team assignments, contracts, and Free Agent authority are copied exactly from the active snapshot into a new auditable mapping run.
- Blocked or missing Free Agents remain unknown/null and are never interpreted as zero.
- Weekly schedules, results, standings, and statistics retain their normal route and current-period validation.
- Roster-derived development observations and trade-roster reconciliation are skipped because the import contains no new roster evidence.
- Candidate construction, validation, retained snapshots, audits, and atomic activation remain unchanged.

## Data and migration impact

Code only. Migration 43 remains current. Deployment does not run an export, import a snapshot, activate data, rotate the permanent export URL, archive or transition a season, reset data, or delete retained captures, reports, snapshots, or audits.

## Known inherited blockers

Madden's explicit Free Agents route may remain blocked upstream. FranchiseHQ preserves that state as unknown/null, never zero. A rosterless import cannot establish the first snapshot of a season and cannot accept an incomplete or partial roster export.

## Validation evidence

Focused rosterless-readiness and candidate-import regressions prove first-import refusal, exact same-season carry-forward, contract preservation, partial-roster refusal, and blocked Free Agent preservation. Complete repository and strict gate results are recorded in `validation-evidence.json`.

## Deployment status

Pull request, protected Main merge, and Production deployment are standing-authorized. No migration, Madden export/import, snapshot activation, Discord command registration, export URL rotation, season operation, or Production data write is required for deployment.

## Rollback

Restore Main `12a2bd4b6983273ac504326dee2c69845834b3f1` / FranchiseHQ 7.5.7.2. No database rollback is required. All retained export captures, discovery reports, mapping runs, candidate and active snapshots, audits, season/game-year records, and Free Agent state remain intact.
