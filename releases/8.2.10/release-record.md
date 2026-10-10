# FranchiseHQ 8.2.10

## Scope

Player Card > Statistics reads frozen archived player summaries through the current franchise's stable player identity and displays prior years alongside current-year totals. Player Card > Details and Game Logs retain the existing current-snapshot-only data. Leaderboards, matchups, imports, Discord commands and rule checks are unchanged.

## Added during delivery

Archived history loads only when Statistics is selected, through a separate member-authorized read endpoint and tenant/snapshot/player cache. Stale responses cannot repaint another card or league. Failures show a retry option. Duplicate current seasons are excluded; career percentages and passer rating use combined totals, longest plays use maxima, fractional sacks are retained. No archived summary is added to the shared live statistics model.

## Known inherited blockers

History can only show statistics previously imported and archived under a matched stable identity. Missing historical metrics remain unavailable rather than fabricated. Madden edition and franchise boundaries remain isolated. Existing legacy archive summaries are read without changing them.

## Validation evidence

Real SQLite tests exercise identity and tenant/franchise/edition scope, closed-season retrieval, snapshot changes, missing identities, and read-only behavior. Real browser-function tests cover current-only data separation, combined totals, shared requests, stale tenant responses and retry. Strict quality passed all 556 tests, migration/schema verification, security/static checks, inventory and release contract. The focused 32-test suite passed. Hosted preview and authenticated production acceptance remain pending publication.

## Deployment status

Production publication is authorized after required quality checks. No migration or separate Worker deployment is needed. Schema remains 54. No import, archive, Discord action, settings change or data backfill is required.

## Rollback

Restore the prior 8.2.9 Pages deployment 72890358-08fd-4ce4-b441-9927470d24be. No database rollback is required; all archived summaries and current snapshots are untouched.
