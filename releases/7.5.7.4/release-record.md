# FranchiseHQ 7.5.7.4

## Scope

Repair same-season roster carry-forward when Madden assigns a new technical ID to every team between the active roster snapshot and newly exported League Info.

## Root cause and correction

Production read-only evidence proved that all 32 active team IDs changed while every old team still had exactly one matching new team identity. The 7.5.7.3 guard correctly refused to publish players against nonexistent candidate team IDs, but it did not yet translate that safe one-to-one namespace change.

The player mapper now builds a complete one-to-one identity proof across the active and candidate team domains, rebases only the normalized `team_external_id` foreign key, and retains the original immutable player source record. The mapping run, candidate source metadata, snapshot manifest, warnings, and activation audit record the rebase counts and preservation guarantees.

## Added during delivery

Read-only Production diagnosis proved the complete 32-team ID rotation and ruled out a missing team. The retained rosterless path now carries a fail-closed team identity rebase, provenance metadata, user-visible warnings, snapshot-manifest evidence, and regression coverage for both successful and unsafe mappings.

## Safety behavior

- The active and candidate team domains must contain the same number of unique teams.
- Every changed team ID must resolve to exactly one canonical or exact team identity, with no duplicate destination.
- Every rostered player must resolve through the proven map; missing, ambiguous, conflicting, or incomplete evidence fails closed.
- Player identity, contract fields, ratings, original source record, and semantic team assignment remain unchanged.
- Blocked or missing Free Agents remain unknown/null and are never interpreted as zero.
- The active snapshot remains untouched until ordinary candidate validation and guarded atomic activation complete.

## Data and migration impact

Code only. Migration 43 remains current. Deployment does not run an export/import, activate a snapshot, alter rosters, reset/delete data, rotate the export URL, archive/transition a season, create Discord threads, or modify credentials/memberships.

## Validation evidence

Focused regressions cover successful technical-ID rebasing with contract/source preservation plus refusal of incomplete, ambiguous, duplicate, conflicting, and unknown assignments. Complete repository and strict gate results are recorded in `validation-evidence.json`.

## Known inherited blockers

Madden's explicit Free Agents route may remain blocked upstream. FranchiseHQ preserves that state as unknown/null, never zero. This release does not make a first-season rosterless import eligible and does not accept a partial roster export.

## Deployment status

Pull request, protected Main merge, and Production deployment are standing-authorized. No migration, Madden export/import, snapshot activation, Discord command registration, export URL rotation, season operation, or Production data write is required for deployment.

## Rollback

Restore Main `168f267e8bf2a322c19dc94b27b2b039460662ef` / FranchiseHQ 7.5.7.3. No database rollback is required. Preserve the failed candidate, its reports and captures, every active/prior/malformed snapshot, audits, the permanent export URL, season/game-year state, Discord records, and blocked/missing Free Agent state.
