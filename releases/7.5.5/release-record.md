# FranchiseHQ 7.5.5 Release Record

## Scope

Deliver the owner-approved low-click Discord command and trade workflow without creating a separate FGC implementation. The same tenant, membership, active-snapshot, Trade Center, and audit authorities serve every league.

## Added during delivery

- `/schedule current`, `/schedule week number`, and `/schedule team name`.
- Bare `/standings` with optional `show`; `/games unplayed`, `/games played`, and `/games all`; bare `/gm-history` with optional `show`.
- One bounded active-snapshot player autocomplete query instead of full-roster pagination.
- Additive migration 38 and a commissioner-selected channel for newly created private trade threads.
- Live owner and website trade updates in the shared private thread, with Bot DMs retained only as fallback.
- Owner Accept, Reject, and Counter Offer actions; commissioner Approve and Deny actions with an optional reason and named live tally.
- Threshold committee denial becomes Changes Requested. Revised terms reuse the same trade ID and Discord thread, retain prior revision reviews/reasons, and begin a new revision-scoped acceptance/review cycle.
- League Home rushing leaders include Madden `HB` players.

## Validation evidence

Focused database, Discord, trade, UI, and migration tests pass. The full application suite passes 221/221 tests. The strict gate passes 211/211 tests, 255 JavaScript syntax checks, 21 canonical migrations, 115 required tables, 600 inventoried files, 76 routes, environment separation, asset validation, repository policy, and secret scanning.

## Known inherited blockers

None.

## Deployment status

The owner explicitly authorized GitHub publication, Main merge, Production migration 38, exact Discord command registration, and Production deployment after accepting the validated local candidate. Execution evidence remains pending and must be recorded without changing the preservation boundary below.

## Rollback and preservation

The application rollback baseline is Production Main `2aec1b4` (7.5.4). Migration 38 is additive and nullable, so a code rollback can retain it safely. Do not delete or rewrite trade workflows, reviews, messages, Discord trade rooms, snapshots, imports, or audits. Do not rotate the permanent export URL, archive/transition a season, or reinterpret blocked Free Agents as zero.
