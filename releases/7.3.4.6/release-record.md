# FranchiseHQ 7.3.4.6 Release Record

**Status:** Released; owner-authorized retained-source activation accepted

**Production changed:** Yes, within the authorized scope. Production serves exact Main commit `4c9d75a8ec09caa2bc50ae888fd6b2af255f58b3`, Pages deployment `dca6eb7d-9e6d-4678-ab7c-a5194429373c`, and import Worker version `e7d81630-5d93-4726-a0c2-f71e8c12e96a`. Validation-ready snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` is active at Week 9 and retains snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8` as its previous pointer.

## Scope

Treat the Madden capture route as the authoritative schedule stage/week, compose all complete retained periods through the selected older export in one candidate, and publish that candidate atomically without rolling back the active Week 9 teams, players, rosters, standings, or live-week position.

## Added during delivery

- Normalize schedule rows from `/week/pre|reg|post/{week}/schedules` using the route even when Madden's payload exposes a zero-based `weekIndex`.
- Keep Preseason Week 1 distinct from Regular Season Week 1 through a canonical stage/week period key.
- For an eligible historical source, pin the latest retained capture for every exact route from the prepared season boundary through the selected source period. Only periods with schedule and statistics route evidence enter the candidate.
- Pass the exact retained capture IDs through the commissioner and Worker import paths so schedule and statistics mapping operate on the same auditable bundle.
- Re-process every exact statistics route in a retained bundle, including hashes already present in the live manifest, so the candidate contains its own complete rows.
- Overlay all retained historical period games/statistics into the active immutable snapshot while preserving the Week 9 current-state plane. Every selected period must produce both domains or the candidate stops safely.
- Keep Free Agents blocked/unknown with a null count.

## Known inherited blockers

- Madden's explicit Free Agent route remains blocked upstream. The rostered-player import may proceed only with Free Agents unknown/null.
- The underlying refresh/login session redesign remains scheduled for 7.5.0.
- An incomplete retained period is not eligible for composition; FranchiseHQ never manufactures missing games or statistics.

## Production source evidence

Read-only inspection found data-bearing retained schedule/statistics routes for Preseason Weeks 1–3 and Regular Season Weeks 1–8. Madden also emitted Preseason Week 4 routes, but all eight were parsed zero-record placeholders, including zero scheduled games, so they are not represented as an active week. The selected ready source remains Regular Season Week 8. No new Madden export or URL rotation is required or authorized.

## Validation evidence

- Focused regressions prove route-authoritative correction, stage-aware period identity, four-period composition, legacy regular-season compatibility, current/future row rejection, and preserved live Week 9 records.
- Database-backed regressions retain authenticated commissioner, exact-season, atomic activation, and idempotency boundaries.
- Migration 26 remains current; 7.3.4.6 adds no migration.
- The consolidated strict gate passed 110/110 tests across 203 JavaScript modules, 65 routes, migration 26, and 79 required tables.
- PR #22 passed 4/4 candidate checks. Exact candidate `4c9d75a` was fast-forwarded to Main and all eight recorded Main/Production checks passed.
- The one authorized workflow pinned 88 captures across 11 periods, applied 169 historical games and 6,558 historical statistic rows, and activated a validation-ready 32-team/2,042-player/184-game/6,966-statistic/32-standing snapshot in 149.055 seconds.
- The final snapshot contains Preseason Weeks 1–3 and Regular Season Weeks 1–9 with no missing regular-season period and zero route/week mismatches. Preseason Week 4 remains correctly absent because every captured route was an empty placeholder.
- Validation recorded zero errors and two expected historical-identity warnings: the retained Week 2 Khyiris Tonga and Week 7 Grady Jarrett defensive rows no longer match the preserved active Week 9 roster. The statistic rows remain retained; the active roster was not expanded or rolled back.
- Exact data comparisons found zero team, player/roster, or standing differences from the prior active Week 9 snapshot. Users/memberships remain 8/8, token version remains 1, temporary sessions/delegations are zero, and foreign-key violations are zero.

## Deployment status

- PR #22 is merged at exact commit `4c9d75a8ec09caa2bc50ae888fd6b2af255f58b3`, and Main points to that same commit.
- Cloudflare Pages deployment `dca6eb7d-9e6d-4678-ab7c-a5194429373c` and import Worker build `845c2a0b-6e1a-4c03-8275-22a49a391a14` / version `e7d81630-5d93-4726-a0c2-f71e8c12e96a` succeeded. The live domain reports 7.3.4.6.
- Exact run `candidate_import_79dfb9b5-c4b5-4956-84f0-d7774dcfcf7d` activated snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e` once. One lifecycle event and one activation audit row record the pointer move.
- No staging, migration, new Madden export, reset, export-URL rotation, Archive Season, game-year transition, permanent deletion, or Free Agent reinterpretation ran. Free Agents remain blocked/unknown with a null count.

## Rollback

- Runtime rollback restores exact 7.3.4.5 Main commit `df3bcb7cd927f21acd3362d62a722d582f485884`, Pages deployment `927eb46c-1e53-4f72-a0b6-698c2a351861`, and Worker version `87b5571a-8aff-49f9-853a-d0749d968d6f`.
- Retain active snapshot `b00edb25-ac65-40d4-9969-431f94dd1e3e`, previous snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8`, and every 7.3.4.6 candidate, activation, lifecycle, audit, mapping, report, and raw-capture row. Restoring an earlier snapshot is separate from code rollback.
