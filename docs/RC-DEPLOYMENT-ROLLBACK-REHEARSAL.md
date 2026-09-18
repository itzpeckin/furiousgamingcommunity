# 7.6.0-rc.1 deployment and rollback rehearsal

## Candidate deployment

1. Verify the branch descends from exact Main `7e9f6f49d08514dcf838740877e7b42f12ceb836` and has no unrelated local changes.
2. Run the complete strict gate and record the exact candidate SHA.
3. Publish one pull request and require all hosted checks on that SHA.
4. Capture a Production D1 Time Travel bookmark and protected counts against database `franchise-hq-db-madden27` / `b2529150-28af-42ca-a07b-69506764ccb6`.
5. Apply only migration 45. Verify the continuous ledger, 124 required tables, protected counts, and zero foreign-key violations. The migration does not replay a Discord delivery.
6. Merge the exact candidate to Main. Let the Git-integrated Pages deployment publish Main and deploy the import Worker from the same source.
7. Perform read-only HTTPS and signed-in acceptance. Confirm the live snapshot, current season/week, roster/schedule counts, Free Agent unknown state, Operations diagnostics, public policy pages, and release marker.

## Application rollback

If the application fails after migration 45, redeploy the previous accepted Main application commit. Leave migration 45 in place: it is additive and older 7.5.9 code ignores the new table. Do not roll the database backward merely to roll back application code.

Expected rollback preservation:

- active snapshot pointer and every active/prior/malformed/private snapshot;
- source captures, import runs, yearly schedule, rosters, contracts, standings, and statistics;
- Free Agent status as blocked/unknown;
- memberships, assignments, sessions, trades, votes, transactions, Discord rooms/deliveries, permanent export URL, and audits;
- migration 45 destination attempts already recorded.

## Database recovery boundary

A D1 Time Travel restore overwrites the selected database and is not part of routine release rollback. Do not restore unless a separately authorized incident identifies the exact target, recovery bookmark, expected data impact, write freeze, and post-restore reconciliation. Never use reset/delete, URL rotation, season archive/transition, a new Madden export, or Discord thread recreation as release rollback.

## Rehearsal result

Local fresh/upgrade migration, backup/restore simulation, tenant isolation, and exact-target validation are automated. Production rehearsal is limited to bookmark capture, additive migration, read-only reconciliation, and application rollback readiness; no destructive restore is executed.
