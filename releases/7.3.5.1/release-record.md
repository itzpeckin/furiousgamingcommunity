# FranchiseHQ 7.3.5.1 Release Record

**Status:** Locally validated Production-authorized candidate

**Production changed during candidate work:** No. Production remains on exact 7.3.5 commit `1d9cbc2186762e16da1028bbfd8fd2f326c984e9`; active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` remains unchanged.

## Scope

Correct three display-integrity defects found during 7.3.5 Production acceptance: retain the complete approved ratings object through the final player-card adapter, convert canonical contract dollars to the Trade Center's documented millions input, and derive the global season/week shell from the active snapshot.

## Added during delivery

- The roster-to-player-card adapter now preserves all 55 allowlisted Madden rating fields while retaining normalized core aliases.
- Trade Center's live bridge now converts salary and cap-hit dollars to millions exactly once and uses a new cache namespace so stale mis-scaled browser data cannot survive deployment.
- The league context and live-week header now hydrate from the active snapshot instead of static Season 4/Week 8 mock labels.
- Regression tests lock all three adapter contracts and the release cache boundary.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. Its count remains unknown/null, never zero.
- Refresh/login session redesign remains scheduled for 7.5.0.

## Validation evidence

- Focused display-integrity tests pass for complete ratings preservation, contract-unit conversion, cache invalidation, and active-snapshot header hydration.
- The consolidated strict repository gate covers syntax, repository contracts, assets, secrets, environment contracts, migration continuity, release evidence, inventory, and the full automated suite.
- Migration 26 remains current; 7.3.5.1 adds no migration.
- Production HTTPS acceptance after exact deployment must confirm a non-core player rating group, a correctly scaled Trade Center cap hit, Season 2026/Regular Season Week 9 shell context, and unchanged active-snapshot/Free-Agent state.

## Deployment status

- Branch `codex/franchisehq-7.3.5.1`, pull request publication, hosted checks, exact Main fast-forward, and Production deployment are authorized.
- Deployment is code-only. No Madden export/import, candidate build, activation, reset, Archive Season, game-year transition, permanent deletion, export-URL rotation, membership, credential, or database mutation is authorized.

## Rollback

- Restore exact 7.3.5 Main commit `1d9cbc2186762e16da1028bbfd8fd2f326c984e9`, Pages deployment `484acd14-7d27-4dbd-81cc-c97b5fc638a4`, and import Worker build `b4588f36-cda5-4e83-8219-24e828992e8a` / version `2b745b42`.
- Retain active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`, previous snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8`, every data/audit row, and the permanent league export URL. Runtime rollback authorizes no data operation or Free Agent reinterpretation.
