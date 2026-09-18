# FranchiseHQ 7.5.7.6

## Scope

Repair the remaining deterministic server interruption before the first candidate-snapshot checkpoint for the retained same-season rosterless weekly import.

## Root cause and correction

Production read-only evidence after 7.5.7.5 showed the retry updated the candidate run but created no new private snapshot. The live Week 1 pointer and the three earlier 2,250-record partial attempts were unchanged. This proves the request ended while reconstructing all domains and preparing the complete record plan, before the bounded write loop could provide its first checkpoint.

The builder now creates and links the exact private candidate immediately. Subsequent calls build teams, players, games, statistics, and standings independently, preparing and writing at most 125 records in one D1 batch per request. Progress and domain metadata live on the private snapshot. A transient lost response retries against the same candidate-run pointer, and progress uses stall detection rather than a fixed total-record ceiling.

## Added during delivery

Read-only Production diagnosis proved that the 7.5.7.5 retry did not create a fourth partial snapshot: construction ended before its first checkpoint. The release therefore adds an immediate zero-record checkpoint, five independently resumable domain steps, idempotent response-loss recovery, and a season-sized regression containing 3,321 records without introducing a fixed total-record ceiling.

## Safety behavior

- Existing partial, malformed, prior, and active snapshots remain retained and unmodified.
- The checkpoint is pinned to the exact candidate, league, game year, and four mapping runs.
- Repeated start requests return the same checkpoint; continuation cannot target a different source plan.
- Snapshot validation cannot begin until all five domains and final manifest composition complete.
- The active Week 1 snapshot remains authoritative until ordinary validation and atomic activation finish.
- Roster assignments, contracts, yearly schedule, Discord thread authority, and blocked/missing Free Agent state are unchanged by deployment.

## Data and migration impact

Code only. Migration 43 remains current. Deployment does not run an export/import, activate a snapshot, delete or rewrite private partial attempts, reset data, rotate the export URL, archive/transition a season, create Discord threads, or modify credentials/memberships.

## Validation evidence

Focused regression creates the checkpoint with zero records, repeats start idempotently, completes all domains across bounded requests, verifies the exact record count, validates the candidate, and preserves the Week 1 clock plus 18-week schedule horizon. Complete repository and strict results are recorded in `validation-evidence.json`.

## Known inherited blockers

Madden's explicit Free Agents route may remain blocked upstream. FranchiseHQ preserves that state as unknown/null, never zero. The retained League Info + Weekly Stats export remains sufficient for this same-season retry because the active roster and contracts remain authoritative.

## Deployment status

Pull request, protected Main merge, and Production deployment are standing-authorized. No migration or Production data operation is required. After deployment, the commissioner may select **Retry** against the already-retained export; no new Madden export is required.

## Rollback

Restore Main `dc662ae51e8f21a115cb5a61dfc4d7f906848bd2` / FranchiseHQ 7.5.7.5. No database rollback is required. Preserve the failed candidate, all private partial/checkpoint snapshots, captured export, mapping runs, active/prior/malformed snapshots, audits, permanent export URL, season/game-year state, Discord records, and blocked/missing Free Agent state.
