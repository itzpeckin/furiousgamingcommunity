# FranchiseHQ 7.5.7.5

## Scope

Repair deterministic server interruption during candidate snapshot construction for a same-season rosterless weekly import.

## Root cause and correction

Production read-only evidence proved that three retries each created a private Week 2 snapshot and stopped at exactly 2,250 of 3,353 expected records: 32 teams, all 2,046 carried players, and 172 of 304 games. The prior builder performed every record write in one request, in sequential 150-record D1 batches, and the runtime ended the request after the fifteenth batch.

The builder now creates one private candidate and advances it through bounded 500-record requests. Each continuation verifies the exact candidate and pending snapshot, recomputes the same immutable source plan, confirms all expected domain counts remain unchanged, and resumes from the number of records already committed. A lost response therefore resumes safely, while a changed source fails closed.

The browser keeps the Build Import Snapshot phase active until the server reports that every expected record is present. Only then does the existing batched validation begin. The guarded atomic activation remains unchanged.

## Added during delivery

Read-only Production diagnosis captured the exact failed run, all three private partial snapshots, the 3,353-record immutable plan, and the repeatable 2,250-record cutoff. The release adds visible build progress, response-loss-safe continuation, fail-closed source-plan verification, and regression coverage that completes and validates a candidate across multiple build requests.

## Safety behavior

- Existing partial, malformed, prior, and active snapshots remain retained and unmodified.
- A continuation cannot target another candidate, league, status, season/game year, or source plan.
- Snapshot validation cannot begin from the new flow while the record build is incomplete.
- The active Week 1 snapshot remains authoritative until ordinary validation and atomic activation finish.
- Roster assignments, contracts, the yearly schedule, Discord thread authority, and blocked/missing Free Agent state are unchanged by deployment.

## Data and migration impact

Code only. Migration 43 remains current. Deployment does not run an export/import, activate a snapshot, delete or rewrite the three private partial attempts, reset data, rotate the export URL, archive/transition a season, create Discord threads, or modify credentials/memberships.

## Validation evidence

Focused candidate-import regression covers multi-request construction, durable continuation, exact final record count, subsequent validation, and preserved Week 1 clock/full-season schedule behavior. Complete repository and strict gate results are recorded in `validation-evidence.json`.

## Known inherited blockers

Madden's explicit Free Agents route may remain blocked upstream. FranchiseHQ preserves that state as unknown/null, never zero. The retained League Info + Weekly Stats export is otherwise sufficient for this exact same-season retry because the live roster and contracts remain authoritative.

## Deployment status

Pull request, protected Main merge, and Production deployment are standing-authorized. No migration or Production data operation is required. After deployment, the commissioner may select **Retry** against the already-retained export; no new Madden export is required.

## Rollback

Restore Main `897255b7bf27e8b66da442385d589d990734099d` / FranchiseHQ 7.5.7.4. No database rollback is required. Preserve the failed candidate, all three private partial snapshots, captured export, mapping runs, active/prior/malformed snapshots, audits, permanent export URL, season/game-year state, Discord records, and blocked/missing Free Agent state.
