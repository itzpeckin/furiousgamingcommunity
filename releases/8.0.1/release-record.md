# FranchiseHQ 8.0.1

## Scope

Repair the first real multi-league experience so every league page identifies its resolved tenant, the Active League card opens the authenticated league selector, and a brand-new league cannot borrow FGC teams while its own Madden import is empty.

## Added during delivery

- The sidebar brand, Active League name, initials, browser title, and switcher accessibility label now come from the server-resolved tenant rather than hard-coded FGC copy.
- The Active League card is a real link to `/leagues`, where an authenticated user can choose among their league memberships.
- The commissioner team directory now displays only teams from the selected tenant's active Madden snapshot. It never falls back to the legacy global FGC directory.
- A new tenant with zero imported teams may activate a Commissioner or Trade Committee member without a team, breaking the setup catch-22. A Team Owner still requires a team, and every role again follows the configured team-assignment policy as soon as the tenant has active imported teams.
- The empty state explains that Madden teams must be imported before franchises or Team Owners can be assigned.

## Known inherited blockers

None are registered in the repository quality baseline. P2W has no active Madden snapshot or team import yet, so team assignment remains intentionally unavailable until P2W imports its own franchise data. Madden Free Agents remain unknown whenever the source is blocked or absent.

## Validation evidence

Read-only Production diagnosis proved that FGC has 32 active teams while P2W has zero and no active snapshot. Focused regressions verify server rejection of a foreign team, teamless activation for an empty-tenant commissioner, continued Team Owner protection, tenant-derived shell labels, a working league selector link, and removal of the global team fallback. The complete strict repository gate passes all 303 tests.

## Deployment status

The code-only release is authorized for branch publication, protected pull-request validation, Main merge, and Production deployment. No migration is required. Candidate work has not activated a member, assigned a team, imported data, changed a snapshot, operated Discord, rotated an export URL, changed a season, deleted/reset data, or reinterpreted Free Agents.

## Rollback

Redeploy the accepted 8.0.0 Main runtime at `c7cdeb5f93769367970186411b0748d2b74832da`. No database rollback is needed because 8.0.1 has no migration and performs no release-time data operation. Retain both tenants, every membership, snapshot, import, export, audit, identity, and season record.
