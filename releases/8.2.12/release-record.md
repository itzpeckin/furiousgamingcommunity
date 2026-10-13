# FranchiseHQ 8.2.12

## Scope

Repair all EA Direct postseason round types. FGC job eaj_94cce15a-cee5-4506-9ba9-0bd8f30c2258 failed with native type 3, week index 19, displayWeek 0 and the matching season export available. The previous patch and fixtures assumed every playoff round had native type 2.

## Added during delivery

Support reference-confirmed postseason types 2/3/4/5/6 with exact available export indices 18/19/20/22. Preserve previous/current collection, skip Pro Bowl index 21 before Super Bowl, and retain Companion routes and season binding. Explicit unsupported/offseason native periods cannot fall back to stale playoff titles.

## Known inherited blockers

No EA authentication, Discord scheduling, import timing or database changes. Conference and Super Bowl fixtures use reference-supported types; actual live acceptance awaits normal commissioner collection. Source export indexing is retained, including Super Bowl index 22; no historical week renumbering.

## Validation evidence

Five regression cases fail against 8.2.11, including the production-shaped Divisional failure, all-type/all-index coverage, stale offseason title rejection, persisted capture boundaries and collection completion. All 77 focused tests and all 562 strict-gate tests pass. Schema/migration, static security, inventory and release checks pass. Hosted preview/production checks await publication.

Reference: https://github.com/snallabot/snallabot-service/blob/b135dfb3afc94f85d19d02f21855e98ea2c369e1/src/dashboard/ea_constants.ts and ea_client.ts. Types 2 and 3 are independently confirmed by bounded FGC production diagnostics.

## Deployment status

Production publication authorized after quality gates. Pages-only release; schema 54 and separate Workers unchanged. No live EA login, export, import, Discord action or league configuration changes.

## Rollback

Restore 8.2.11 Pages deployment c5b4bbd1-7a06-4117-b4ff-84b37c5f0ae1. No database rollback required. Divisional and later-round detection would again fail.

Additional round reference: https://github.com/bep713/madden-franchise-editor/blob/94b09375549e7c931e2782818c0724d5aed361c3/data/seasonWeekData.json lists Conference Championship schedule type 4 and Super Bowl type 5. The reader accepts postseason types 2 through 6 only with a playable matching export index; Pro Bowl index 21 is always rejected. This avoids relying on the incomplete seasonType switch in the other reference.
