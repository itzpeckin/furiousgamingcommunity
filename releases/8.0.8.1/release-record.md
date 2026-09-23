# FranchiseHQ 8.0.8.1 — Platform Admin period authority

Baseline: Main `4cfb81104b0824d7ca796e5c97d94a9174d2d869` (8.0.8).

## Scope

Authenticated Production acceptance of 8.0.8 confirmed the protected Platform Admin console but showed FGC as Season 1 Week 1. The directory query was reading the league's original setup defaults even though the active snapshot correctly represents 2027 Week 5.

This correction reads `season_year` and `week_index` from the active snapshot selected by `league_active_snapshots`. The static league fields remain a fallback only for tenants such as P2W that do not yet have active Madden data.

## Added during delivery

The owner API regression fixture now proves the exact disagreement seen during live acceptance: league setup remains Week 2 while the active snapshot is Week 5, and the Platform Admin response must report Week 5.

## Known inherited blockers

EA's Madden Companion roster-export availability remains outside FranchiseHQ control. P2W still has no active Madden snapshot, so its setup-period fallback remains expected until its first approved import.

## Safety

This is a read-model correction. It does not update a league, snapshot, active pointer, onboarding plan, membership, Discord record, import, export endpoint, credential, season, roster, or Free Agent value. Migration 47 remains current.

## Validation evidence

Focused coverage creates a league whose setup period differs from its active snapshot and requires the owner API to return the active snapshot period. All 9 focused checks pass. The complete strict repository gate passes all 310 tests, 667 tracked-file checks, and 87 route checks.

## Deployment status

Production deployment is authorized and fully validated, pending pull-request publication, merge, hosted checks, and authenticated live acceptance. No database or league-data operation is part of deployment.

## Rollback

Application rollback returns to Main `4cfb811` without changing any retained data or platform state.
