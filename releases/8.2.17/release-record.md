# FHQ 8.2.17

## Scope

Temporary Discord throttling no longer ends scheduling as a permanent conflict. The schedule workflow durably waits for the provider retry interval and resumes retained progress. Thread creation completes before member additions; prior threads can be archived after all new threads exist. Missing/unreachable members are recorded and skipped, with access retried against later imported snapshots. Linked commissioners still receive membership when accessible. Preseason exclusion and explicit regular Week 1 launch remain intact.

Trade-block reconciliation retires a listing when authoritative current ownership differs from the listing team, including imported transfers and releases. It runs after fresh roster activation and before website/Discord trade-block reads. It retains approved ownership overlays, tenant isolation, and active-snapshot guards. A player returning to the original team does not resurrect an old listing; the new owner must explicitly list the player.

## Validation evidence

All 593 automated tests and the lint, independent implementation, syntax, assets, secrets, environment, strict migration and inventory checks passed. Focused tests cover automatic cooldown/resume, creation before membership, absent members, idempotency, route separation, imported transfers, free agency, relisting and tenant isolation. Full release validation is recorded in validation-evidence.json. No new schema migration. Both Pages and the private Import Worker require publication. Live scheduling latency remains subject to Discord and is not guaranteed by fixture timings.


## Added during delivery

Route-aware pacing preserves queued requests when Discord first supplies a bucket identifier. Cooldowns display as progress rather than failure details.

## Known inherited blockers

None registered. External Discord availability and response times still apply.

## Deployment status

Authorized candidate; preview, production and private Worker publication pending. No live import or Discord mutation performed during implementation.

## Rollback

See recovery-plan.md. Restore the compatible Pages/Worker baseline while preserving thread history and soft-retired listings.
