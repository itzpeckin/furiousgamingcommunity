# FranchiseHQ 7.5.5 Release Record

**Status:** Production deployed and read-only verified; signed-in owner acceptance pending

**Production changed:** Yes. The exact validated candidate is merged to Main, additive migration 38 is applied, the four approved Discord commands are registered, and Production serves 7.5.5. No protected league data changed.

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

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero.

## Deployment status

PR #62 merged the validated candidate `1dc80e232dc889b5ae464e32eed742d62b753b42` to Main as `0b75e9bb61222c3b1069b823d32b9cd914a4c789` after all four pull-request checks passed. All five Main checks then passed.

Before the schema change, Production D1 target `franchise-hq-db-madden27` (`b2529150-28af-42ca-a07b-69506764ccb6`) was confirmed and Time Travel bookmark `000001d1-00000194-000050e2-2f07bc13f368d9d28a0b5aa7b9b6c69b` was recorded. Exact migration hash `D4DD7FA1A6215D794D540D9DF15B9C3E97224D73C46D7CC203C4ED264E9396FC` advanced the continuous ledger from 37 to 38 and added only nullable `discord_league_installations.trade_channel_id`. Post-migration bookmark `000001d1-000001b8-000050e2-4ee6a96cb1b576d5fd30a426b4242386` is retained, and `PRAGMA foreign_key_check` returned no rows before and after deployment.

Git-integrated Production deployment `f4025f4f-1a1e-4896-b7a8-5f30e765a87b` published exact Main source. Bounded follow-up deployment `d973561f-bbec-40b7-8201-674f58419148` registered exactly `/schedule`, `/standings`, `/games`, and `/gm-history`: four upserts, zero retired names, no bulk replacement, and no deletion of unowned commands. The Production build command was immediately restored to `exit 0`. The accepted deployment reports success, retains the `franchisehq.app` Production alias, serves the public `Release 7.5.5` marker, and returns runtime header `x-fhq-route-fix: 7.5.5` from the league boundary.

Final read-only Production verification found migration 38, 115 canonical tables, zero foreign-key violations, 28 retained snapshots, and unchanged active Week 17 snapshot `18235c81-8b40-4729-8d31-53b480ba3371` with previous snapshot `a07614fc-a996-467f-86c2-d87926072882`. The release also preserved 1 league, 32 users, 32 memberships, 31 active team assignments, 9 trade workflows, 16 trade messages, and 3 Discord trade rooms.

No Madden export, import, snapshot activation, reset, deletion, archive, season transition, export-URL rotation, credential change, membership/assignment change, or live trade decision ran. Historical malformed/corrected Week 10 snapshots and their audits remain retained, and blocked Free Agents remain unknown/null.

## Rollback and preservation

The application rollback baseline is Production Main `2aec1b4` (7.5.4). Migration 38 is additive and nullable, so a code rollback can retain it safely. Do not delete or rewrite trade workflows, reviews, messages, Discord trade rooms, snapshots, imports, or audits. Do not rotate the permanent export URL, archive/transition a season, or reinterpret blocked Free Agents as zero.
