# FranchiseHQ 8.2.16

## Scope

Commissioners can launch regular-season Week 1 Discord scheduling threads from the Madden Import workspace or League Controls → Discord Bot after publishing the full season schedule, rosters and league information. The verified Madden clock stays in preseason. No preseason games or threads are created.

A season, server and channel scoped pending scheduling run retains the explicit launch decision. Durable dispatch uses a separate deterministic identity from preseason cleanup. Repeated launches and roster imports reuse the same matchup threads, including the transition to regular Week 1. A verified Week 2 advance continues normal creation and archival. Existing commissioner membership, tenant isolation and archived conversations are preserved.

## Validation evidence

85 targeted Discord/scheduling tests pass, including explicit launch, failed dispatch/retry, concurrent intent registration, preseason roster refresh, regular Week 1/2 transition, permission and stale snapshot rejection, routing/year isolation, incomplete data rejection and year inheritance for season schedule rows. All 587 tests and the strict quality checks passed. Real importer component browser checks passed at desktop and phone widths, including one launch request per double click. Hosted checks remain a publication gate.

## Known inherited blockers

None registered. Discord response times remain provider-dependent.

## Deployment status

Authorized candidate. No Worker or schema change. No live import or Discord mutation performed during implementation.

## Added during delivery

Separate launch/retry controls in the importer and Discord settings, with season readiness guidance.

## Rollback

See recovery-plan.md. Preserve launched threads and avoid preseason sync on the older release.
