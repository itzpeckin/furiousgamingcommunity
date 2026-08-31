# FranchiseHQ 7.3.5 Release Record

**Status:** Locally validated review candidate; publication is not authorized

**Production changed:** No. Production/Main remain on exact 7.3.4.7 commit `e95217cdad8560f8877841d41c4fb972885ac2b8`; active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` remains unchanged.

## Scope

Serve teams, roster groups, player profiles, standings, statistics, and Free Agent browsing from one active Madden 27 snapshot. Expose source-supported ratings, contracts, abilities, positions, freshness, and honest unavailable states while making the high-volume player experience safe at phone and desktop widths.

## Added during delivery

- Added an explicit 55-field Madden rating allowlist and safe signature-ability DTO that excludes internal identifiers.
- Corrected contract presentation to retain total salary/bonus dollars, scale Madden cap hit/release penalty thousands, and mark unsupported current-year splits unavailable.
- Bound Free Agent state to the active snapshot's exact player-mapping lineage; blocked or missing upstream data returns a null/unknown count and can never silently render as zero.
- Removed active-snapshot player/team resolution fallbacks to demo identities, old branding, and independently fetched latest captures.
- Added visible active-snapshot freshness, validation warnings, complete 100-row player paging, captured-week statistics selection, phone card layouts, and page-owned vertical scrolling.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. Its count remains unknown/null, not zero.
- The active snapshot contains two retained historical statistics rows whose players are no longer in the Week 9 roster; the validation warning remains visible.
- Refresh/login session redesign remains scheduled for 7.5.0.

## Validation evidence

- Focused behavior/containment tests prove all approved ratings, safe abilities, documented contract units, source roster states, blocked/null Free Agents, active-snapshot endpoint authority, complete paging, and deterministic mobile scroll constraints.
- The in-app browser security policy blocks local `file://` fixture navigation. Real phone/desktop rendering therefore remains an explicit HTTPS publication acceptance check and is not represented as locally observed.
- Read-only Production inventory wrote zero rows and retained the exact 32-team/2,042-player/184-game/6,966-statistic/32-standing Week 9 baseline.
- Migration 26 remains current; 7.3.5 adds no migration.
- The consolidated strict repository gate is recorded in `validation-evidence.json`.

## Deployment status

- Branch `codex/franchisehq-7.3.5` contains the local review candidate.
- Repository publication, hosted checks, Main, Production, and staging are not authorized and have not run.
- No Madden export/import, candidate activation, snapshot change, reset, Archive Season, game-year transition, permanent deletion, export-URL rotation, membership, credential, or Production data change ran.

## Rollback

- Restore or redeploy exact 7.3.4.7 Main commit `e95217cdad8560f8877841d41c4fb972885ac2b8`.
- Retain active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`, previous snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8`, and all source/import/identity/lifecycle/audit rows. Runtime rollback does not authorize any data operation or Free Agent reinterpretation.
