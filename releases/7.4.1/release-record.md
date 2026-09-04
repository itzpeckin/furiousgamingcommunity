# FranchiseHQ 7.4.1 Release Record

**Status:** Locally validated review candidate; publication, migration, Main, and Production are not authorized

**Production changed:** No. Production remains FranchiseHQ 7.4.0.8 on migration 30.

## Scope

This consolidated cycle completes the planned Transactions and League History foundation and includes the owner's final Trade Center acceptance changes: full-width Trade Review asset rows and active-standings draft-pick projections.

## Added during delivery

- Full-width team-branded player rows throughout Trade Review. Each row uses the accepted Trade Block presentation for Development, Contract, and Age, with explainable Trade Value included only when the shared calculator is enabled. Hiding calculator values does not restructure the package.
- Record-based projected draft slots for every available pick. The current active snapshot standings are read whenever Trade Center state is loaded, inverse order follows the pick's original team, a first-round label renders as `1.01`, and a later Madden import automatically changes the estimate. Exact-record ties are stable estimates because official Madden/NFL tiebreakers are not claimed. Incomplete standings display no projected slot.
- A season-grouped Transactions experience covering public Madden-observed trades, signings, releases, and movements. Member-visible records show before/after team states and source summaries without exposing pending workflow or internal reconciliation labels.
- Permanent signed-in transaction links and a compact `league_transaction_history` projection that survives removal of active Madden-edition transaction/evidence rows during a future transition. The retained relational summary complements the existing immutable game-year archive; it does not preserve or expose raw private payloads.
- Commissioner-only append-only correction revisions for display type, franchise season, Madden week, time, and participant identifiers. Every correction requires a reason and tenant audit event. Original canonical rows and source evidence remain unchanged.
- Trade Center approval now creates its canonical trade, immutable workflow evidence, and permanent History Books projection in the same D1 batch. Later Madden roster reconciliation updates both active and retained summaries while Madden stays authoritative.

## Known inherited blockers

Madden's explicit Free Agent route remains blocked upstream. Its count stays unknown/null and is not interpreted as zero.

## Validation evidence

Focused tests cover inverse-standings updates, original-team pick authority, tie and incomplete-standings behavior, two-to-four-team full-width Trade Review, calculator-off layout invariance, Trade Center atomic history creation, member/commissioner access, tenant isolation, sanitized source evidence, repeated workflow/roster idempotence, append-only correction revision conflicts, and permanent-link readback after active canonical rows are removed. The full consolidated gate passes 162/162 tests; fresh and legacy migration tests reach schema 31 with zero foreign-key violations.

The strict repository gate passes 228 JavaScript modules, 565 inventoried files, 69 routes, HTML assets, environment separation, and the secret scan. No cloud environment or Production data was touched during implementation.

## Deployment status

Not authorized and not run. The release branch remains local. Migration 31 has not been applied anywhere outside disposable test databases, no pull request exists, Git Main remains unchanged, and Production remains on 7.4.0.8/migration 30.

## Rollback

The immutable rollback baseline is exact commit `ffcb61145b4d5a5e68a6d371ebef588249b01c7e`, tree `99cbc4475b2b1a80d8f072dd60110ac232a2a0cf`, representing the recorded and owner-accepted FranchiseHQ 7.4.0.8 Production state.

## Next gate

Finish the consolidated local gate and create one exact local candidate commit. Publication, pull request, Production migration 31, merge to Main, Production deployment, and read-only acceptance each remain unexecuted until the owner authorizes that exact candidate.
