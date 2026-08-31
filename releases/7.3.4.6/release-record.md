# FranchiseHQ 7.3.4.6 Release Record

**Status:** Locally validated; Production publication and one retained-source activation authorized

**Production changed:** No. Production remains on exact Main commit `df3bcb7cd927f21acd3362d62a722d582f485884`, Pages deployment `927eb46c-1e53-4f72-a0b6-698c2a351861`, and import Worker version `87b5571a-8aff-49f9-853a-d0749d968d6f`. Week 9 snapshot `518236e4-1cac-41f5-b8c8-757b7150dcd8` remains active during candidate work.

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
- The consolidated strict gate is recorded in `validation-evidence.json` and must pass before publication.

## Deployment status

- Create and publish one exact candidate on `codex/franchisehq-7.3.4.6`, open its pull request, pass hosted checks, fast-forward the exact candidate to Main, and deploy Pages plus the import Worker to Production.
- After deployment, retry the retained Week 8 source exactly once. Activation is allowed only for its validation-ready atomic candidate against the expected active pointer.
- Do not use staging, reset data, require another export, rotate the export URL, archive a season, run a game-year transition, permanently delete history, or interpret blocked Free Agents as zero.

## Rollback

- Runtime rollback restores exact 7.3.4.5 Main commit `df3bcb7cd927f21acd3362d62a722d582f485884`, Pages deployment `927eb46c-1e53-4f72-a0b6-698c2a351861`, and Worker version `87b5571a-8aff-49f9-853a-d0749d968d6f`.
- Retain the current active snapshot and any 7.3.4.6 candidate, activation, lifecycle, audit, mapping, report, and raw-capture rows. Restoring an earlier snapshot is separate from code rollback.
