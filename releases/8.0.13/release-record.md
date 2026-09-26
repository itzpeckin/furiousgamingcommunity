# FranchiseHQ 8.0.13 — EA current week and statistics refresh

## Scope

Repair EA Direct private preview season/week parsing and stale game/player statistics after Companion import. Standing owner authorization covers PR, Main merge and production publication after quality gates.

## Added during delivery

The documented native EA hub uses seasonWeek (zero-based), seasonWeekType and displayWeek, with weekTitle only "Week". FHQ previously required a full title match, rejecting that valid response. Resolve native preseason and regular-season periods only when an available export entry agrees; reject contradictory display weeks and advancing leagues. Existing explicit/title-based evidence remains supported. Error guidance claims advancing only when EA actually reports it. Protocol shape reference: https://github.com/snallabot/snallabot-service/blob/main/docs/madden/api_data/get_league.json . This is a protocol compatibility fix; the failed owner's raw response was not retained.

Production already contains 722 Week 7 and 156 Week 8 statistics records in active snapshot cb4fbe0f-c510-403b-8b8e-80d8165369d8. The Week 8 Vikings/Bears game displays both team and player box scores after reload. The import refresh previously left app-level statistics and game-panel caches intact. Publish snapshot refresh events, invalidate those caches and hydrate the new statistics. Revision guards prevent older requests from overwriting current snapshot or tenant data. Refresh an open matchup panel as well as player cards.

## Known inherited blockers

EA franchise selection now succeeds. Actual account preview acceptance remains a live validation gate. Offseason and ambiguous period responses remain blocked; do not infer the current week from the maximum available schedule. No EA import or source activation is part of verification.

## Validation evidence

Native Week 1/7/8/18 and preseason normalization; contradictory/missing/advancing period rejection; native private collection preview without source publication; safe error text; stale request and tenant-switch races; game/player cache refresh tests. Full strict gate and hosted checks recorded in validation-evidence.json and the release PR.

## Deployment status

Authorized Pages candidate. No Worker code change or migration (baseline 48). Existing Worker 8.0.12 remains active. Hosted preview does not run an import because its service binding points to production. Validate any owner connection using private preview only.

## Rollback

Restore Pages 8.0.12 Main dbaf84640205b2fc677a02f7f19c215c5d261f54, deployment 731175c1-cfc4-42ce-a7e4-e5660fe7d979. Keep Worker version 239d366e-f0e0-46e8-97a3-bf371a55c793, migration 48 and all saved snapshots/captures.
