# FranchiseHQ 8.0.19 — one Madden workflow and multi-league trade repair

## Scope

The Command Center provides five explicit steps in one pane: choose EA Direct or Companion, import the season schedule, collect weekly stats, refresh, and import. The support guide holds the detailed instructions. Schedule coverage accepts Companion All Weeks and identifies missing weeks. Priority Queue and Archive Season sit beneath the importer beside the controls/source rail. Matchups use a horizontal back bar labeled for Schedule, My Team, Team Page, or Home.

EA Direct can prepare a new league from its saved Madden edition and the authenticated hub's calendar year. A missing native season identifier requires explicit commissioner confirmation. No source index is derived from a calendar offset. A fully collected and published yearly schedule verifies the connection for weekly collection; incomplete schedules do not. Weekly collection still requests current/previous periods and rosters. Collection and live import remain separate actions.

OTL's live snapshot had 2,604 players but no permanent player identities or aliases. Autocomplete read the snapshot while trade submission required those missing identity rows. Trade validation now resolves the same live roster, checks effective ownership, and creates a stable tenant/franchise-scoped identity when needed. Existing identities are reused; stale, ambiguous, cross-tenant and wrong-owner assets remain rejected.

## Added during delivery

Regression tests cover a signed Discord autocomplete-to-trade submission without prior identities, scope/ownership/stale/ambiguous checks, EA first-season setup without Companion, sealed commissioner season confirmation, complete versus incomplete yearly verification, All Weeks completeness, and close-during-load navigation. All Discord tests run against local fixtures.

## Known inherited blockers

EA sometimes omits the native season identifier; the first-season form requires the exact commissioner-confirmed value. Companion All Weeks completeness depends on what EA actually sends; FHQ requires 18 weeks and 272 games and lists gaps. No live user collection is required for deployment.

## Validation evidence

Strict quality passed all 430 tests; six supplemental checks passed. Local desktop (1440px) and phone (390px) rendering and method switching passed without horizontal overflow. PR CI, hosted checks, and final deployment identifiers are recorded in the release receipt.

## Deployment status

Authorized Pages release, including Pages-hosted EA collection endpoints and Discord interactions. Import Worker and migration 48 unchanged. No live collection, import, archive, trade, identity backfill, export URL rotation, or ownership mutation is performed by deployment.

## Rollback

Restore v8.0.18 Main 94e90374f23479332716e3ee65a69123f718d8e4 and Pages 315279e3-84cf-451d-9e34-ea36a1acb86f. Preserve league data, Worker 239d366e-f0e0-46e8-97a3-bf371a55c793, and migration 48.
