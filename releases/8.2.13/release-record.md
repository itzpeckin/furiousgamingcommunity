# FranchiseHQ 8.2.13 — Offseason imports and Free Agents

## Scope

FGC's retained failed collection reported native seasonWeekType 8, seasonWeek 1 and calendarYear 2027. The previous parser rejected offseason stages before collecting data. It now separates native post-season/offseason clocks (types 7/8) from playable game export routes, across the bounded native phase counter. It does not guess a free-agency/draft phase name or derive the current week from the completed schedule.

EA Direct collects complete team rosters, Free Agents, teams and standings during offseason. When available, the four playoff export periods are refreshed to retain final results; missing fictional offseason game/stat routes no longer block import. Partial rosters cannot publish an offseason update. Exact season/franchise/edition binding and final-hub advance protection remain required. A new calendar season requires the prepared successor through Archive Season; no automatic archive or season offset is introduced.

Offseason imports preserve same-season schedules and statistics regardless of the reset native counter. The import, league context and scheduling dispatcher distinguish offseason from Regular Season Week 1/2. No new matchup threads or automatic recap workflow is dispatched during offseason. Existing thread history remains untouched. Next-season imports retain the existing cross-season boundary.

Free Agents already exist in EA Direct capture and snapshot mapping. A direct Players-page Free Agents button exposes the imported pool and verified count. Only confirmed free agents qualify; unassigned players remain separate. EA collection coverage shows the received Free Agent count. Ratings, traits and roster movements refresh through the normal export/Refresh/Import flow; no signing or claiming system is added.

## Validation evidence

Production diagnosis was read-only. FGC's current snapshot contains 585 confirmed Free Agents. Capture fixtures cover all bounded offseason indices, postseason stale availability, exact new-season preseason/regular indices, partial rosters and an advance during collection. Actual snapshot-building fixtures preserve 272 games and 8,272 statistical records through offseason with an additional Free Agent, then validate the candidate. Desktop/390px actual Players-renderer fixtures verify filtering, unavailable evidence and layout. Full strict, CI and hosted acceptance are required before merge/publication.

No migration, separate Worker deployment, live export/import, archival, ownership change, connection reset or Discord message is performed by publication. Actual provider acceptance awaits an ordinary commissioner collection.

## Rollback

Restore 8.2.12 Pages deployment fbe5e10b-26e2-43c2-8e5f-a3241972a12b if necessary. Schema remains 54. No database rollback is required. A future rollback after an offseason import would lose offseason UI/parser support; preserve the active snapshot and prefer a forward repair.

## Added during delivery

Preserved all same-season history despite the reset offseason counter and suppressed fictional offseason scheduling dispatch.

## Known inherited blockers

None blocking this patch. Live provider acceptance requires a normal commissioner collection; fixture results do not establish live EA acceptance.

## Deployment status

Candidate validated locally with 568 passing tests; hosted preview, CI and production publication pending. Standing release authorization applies.
