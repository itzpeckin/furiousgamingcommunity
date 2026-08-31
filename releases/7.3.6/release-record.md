# FranchiseHQ 7.3.6 Release Record

**Status:** Production accepted

**Production changed:** Yes, code-only. Accepted application commit `fd0458223f903da5533fec9c1b84ce69c7c4a19a` is live on Pages deployment `3138d4d2-d1f7-498e-a15d-89bdb6bdd162`; active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` remains unchanged.

## Scope

Create stable authenticated league-scoped team and player URLs using the permanent player identities and canonical team keys already retained by FranchiseHQ. Preserve legacy hash navigation as a compatibility layer and make existing player/team entry points converge on the canonical routes.

## Added during delivery

- Active player DTOs now carry an opaque permanent `publicId` resolved from 7.3.1 source aliases; active teams carry a stable canonical slug.
- Authenticated player/team identity endpoints return canonical paths plus safe display metadata and explicitly omit raw database identity and source-record contracts.
- The browser router understands deep paths, History API back/forward behavior, and legacy hashes. Hard refresh and Discord recovery retain the exact requested team/player path.
- The asynchronous live-snapshot boot now re-renders the canonical path instead of falling back to `#home`, preventing a cold deep-link refresh from clearing the requested team or player page.
- Rosters, player directory, statistics, transactions, game cards, Trade Block, proposals, command search, standings, and team surfaces use the canonical navigation adapter.
- A permanent player identity absent from the active roster keeps a valid page and is not inferred to be a Free Agent.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. Its count remains unknown/null, never zero.
- Refresh/login session redesign remains scheduled for 7.5.0; 7.3.6 preserves exact deep return paths without changing session policy.

## Validation evidence

- Public-route unit and source-contract tests cover opaque player IDs, bounded team slugs, membership protection, safe DTOs, deep route parsing, hash compatibility, Trade surfaces, and popstate navigation.
- Existing permanent identity, tenant isolation, ownership, containment, live-data, route, and release-shell tests pass.
- The consolidated strict repository gate covers syntax, repository contracts, assets, secrets, environment contracts, migration continuity, release evidence, inventory, and the full automated suite.
- Migration 26 remains current; 7.3.6 adds no migration or identity/data row.
- Production acceptance opened `/leagues/furious-gaming-community/teams/tb` and `/leagues/furious-gaming-community/players/plr_4b7a42df20d945ccb77f5d5766f9290b`, hard-refreshed both, opened the copied player URL in a second authenticated tab, exercised player-to-team and browser back/forward navigation, and repeated the pages at a 390×844 viewport without a console error or session loss.

## Deployment status

- Pull request [#27](https://github.com/itzpeckin/furiousgamingcommunity/pull/27) introduced candidate `04a1869`; cold Production acceptance found and corrected the asynchronous live-snapshot route fallback in `fd04582`.
- Corrective commit `fd04582` passed 3/3 branch checks and 6/6 Main/deployment checks, then deployed as Pages `3138d4d2-d1f7-498e-a15d-89bdb6bdd162`.
- Deployment was code-only. No Madden export/import, candidate build, activation, reset, Archive Season, game-year transition, permanent deletion, export-URL rotation, membership, credential, or database mutation ran.

## Rollback

- Restore exact accepted 7.3.5.1 Main commit `b84af9d9ffa5adb6cf440e733e83210cea83b3d9`, Pages deployment `eb95fd00-bdd6-4565-ae21-65da03b4bd0e`, and unchanged import Worker build `2c7bc863-539d-45bf-a1a4-24edcf1c31b6` / version `d29befdd`.
- Retain permanent identities/source aliases, active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`, previous snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8`, every data/audit row, and the permanent league export URL. Runtime rollback authorizes no data operation or Free Agent reinterpretation.
