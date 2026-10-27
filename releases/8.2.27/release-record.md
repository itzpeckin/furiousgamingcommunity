# FranchiseHQ 8.2.27

## Scope

Replacement GMs were incorrectly backdated to preseason Week 1, inheriting previous owners' results. Offseason Week 2 was interpreted as regular Week 2. Frozen history and live history could select different owners for overlaps. FGC's Week 1 rush audit also skipped retained statistics whose Madden team IDs predated the schedule's verified ID rebase.

## Added during delivery

Ownership now starts at the current season period; if the team's current game is already recorded complete, the change takes effect the following week. Deactivation closes ownership even when inactive membership retains a team. Offseason is ordered after postseason. Overlapping different GMs are not arbitrarily assigned games. Retained historical games restore missing former-GM summaries and clear stale replacement credits across league, My Team, and Discord history. Season archive closes at the end of offseason. Rush/pass checks resolve statistics by exact game, season, week and retained source team side, retaining ambiguity and missing-data checks.

## Known inherited blockers

Website assignments do not prove who actually controlled a game before joining the site. The owner approved website-time cutoffs and confirmed the Saints and Texans handoffs. Unassigned intervals remain uncredited rather than invented. Other provider delays and billing are outside this patch.

## Validation evidence

108 focused tests passed. Scoped FGC Week 1 replay verifies all 16 games and 32 teams without data gaps. Full strict gate and hosted checks must pass before publication. Historical correction is separately backed up and verified from retained games; no new export is needed.

## Deployment status

Authorized candidate. Schema 56 and separate Workers are unchanged. No live import, export or Discord post is used for acceptance. Production GM history repair is planned, not yet applied at this commit.

## Rollback

Restore Pages 8.2.26 deployment d6a14ac5-556f-42dc-bc25-c3da26fc8957 if necessary. Keep corrected ownership data; do not restore the shared database or deleted OTL tenant. If a historical cutoff needs correction, restore only exact affected ownership/GM summary rows from the scoped backup and rebuild those histories. See recovery-plan.md.
