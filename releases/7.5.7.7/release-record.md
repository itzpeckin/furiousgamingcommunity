# FranchiseHQ 7.5.7.7

## Scope

Repair the deterministic games-domain stall in the retained same-season rosterless candidate without another Madden export or any deployment-time data operation.

## Root cause and correction

Production read-only evidence showed that 7.5.7.6 worked through its durable checkpoint: candidate snapshot `88e633a8-a26f-4812-aa46-397bc2ff5755` retained 2,350 records, including 32 teams, all 2,046 players, and 272 games. The builder then stopped at games because the 272-game yearly schedule and the current 32-game Week 2 export shared the same 32 Madden game IDs but used old and newly rebased Madden team IDs. Matchup identity treated those rows as different games and produced a 304-record plan, while D1 correctly retained only 272 unique game IDs.

The builder now applies the already-proven complete one-to-one team identity map to every retained yearly and prior game before overlaying current weekly results. Exact Madden game IDs are resolved once with the current weekly row authoritative. Snapshot continuation uses a durable plan cursor and idempotent upserts, so the existing v2 private checkpoint replays only its game domain in bounded slices, updates obsolete team references in place, and advances even while the unique row count remains 272.

## Added during delivery

- Shared the roster-safe team identity matcher with retained schedule rebasing.
- Added exact Madden game-ID deduplication after matchup/Confidence identity overlay.
- Upgraded checkpoint progress from stored-row count to a plan cursor with a stable checkpoint token.
- Added backward-compatible recovery for the existing `checkpointed-domain-v2` private snapshot.
- Added a production-shaped regression beginning at 304 planned / 272 stored games and proving completion at 272 unique games and 3,321 total candidate records.

## Safety behavior

- Active Week 1 remains authoritative until the commissioner's ordinary retry validates and atomically activates the candidate.
- The existing 2,350-record checkpoint and every prior, malformed, active, and private partial snapshot remain retained.
- The repair performs no deletion, reset, URL rotation, season archive/transition, or Discord scheduling action.
- Roster assignments and contracts remain unchanged; the same proven 32-team mapping is reused only to update candidate schedule foreign keys.
- Blocked or missing Free Agents remain unknown/null and are never interpreted as zero.

## Data and migration impact

Code only. Migration 43 remains current. Deployment does not run an export/import, activate a snapshot, modify the active pointer, or mutate Production data.

## Validation evidence

Focused tests cover team-ID rebase, exact game-ID authority, Confidence identity, 272-game season integrity, and direct recovery of the old 304-planned/272-stored checkpoint. Complete repository and strict results are recorded in `validation-evidence.json`.

## Known inherited blockers

Madden's explicit Free Agents route may remain blocked upstream. FranchiseHQ preserves that state as unknown/null, never zero. The retained League Info + Weekly Stats export and active roster authority remain sufficient for this exact same-season retry.

## Deployment status

Pull request, protected Main merge, and Production deployment are standing-authorized. After deployment, the commissioner can select **Retry** against the retained export and exact private checkpoint; no new Madden export is required.

## Rollback

Restore Main `6971c92e46851d0ea0cabc18fb1ffda4b3770954` / FranchiseHQ 7.5.7.6. No database rollback is required. Preserve candidate `88e633a8-a26f-4812-aa46-397bc2ff5755`, all other private partial/checkpoint snapshots, captured export, mapping runs, active/prior/malformed snapshots, audits, permanent export URL, season/game-year state, Discord records, and blocked/missing Free Agent state.
