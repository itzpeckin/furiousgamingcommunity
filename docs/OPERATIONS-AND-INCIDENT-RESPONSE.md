# FranchiseHQ Operations and Incident Response

This runbook governs 7.5.9 and later operations. It applies per tenant: an incident in one league must never broaden a query, repair, or recovery action to another league.

## Normal health

Commissioner HQ reports five signals from server-owned records:

1. The active snapshot exists, has a canonical period, passed validation, and its stored domain counts match its declared counts.
2. No candidate import has stopped progressing for more than 15 minutes and the latest run is not failed.
3. A connected Discord installation has no failed delivery in the prior day and its latest schedule sync is not failed or partial.
4. Recovery evidence was verified in the prior 30 days.
5. The database ledger is continuous through the runtime-required migration.

Request telemetry contains a request ID, sanitized route template, method, status, duration, and release. It must never contain a tenant slug, export token, request body, raw Madden payload, cookie, authorization header, Discord credential, Cloudflare credential, or personal message content.

## Alert response

- **Canonical league data:** Stop publication activity for that league. Confirm the active snapshot pointer and reconcile declared versus stored teams, players, games, statistics, and standings. Do not activate or delete a snapshot to clear the alert.
- **Import pipeline:** Keep the current active snapshot live. Inspect the exact candidate/run checkpoint and use its ordinary retry only after the failure is understood. Do not request a new export merely to clear a retained failure.
- **Discord delivery:** Keep web data authoritative. Inspect only that tenant's latest sync/delivery rows, channel permissions, and request ID. Do not recreate every thread or change league week.
- **Schema:** Stop the new runtime. Verify the exact D1 target, bookmark, ledger, and pending migration before retrying deployment.
- **Recovery evidence:** Run the read-only exact-target reconciliation. Recording successful evidence is additive; it is not a restore.

## Recovery drill

Use the committed target registry and a short-lived Cloudflare token supplied through the environment, never a command line, issue, message, or repository file.

```sh
npm run recovery:drill -- --target production
```

The drill verifies Cloudflare's returned database identity, captures the current D1 Time Travel bookmark, checks the continuous ledger and foreign keys, preserves protected counts, and reconciles every enabled tenant's active snapshot. After migration 44, `--record` may append the verified tenant-scoped result when the exact production target confirmation is supplied.

The drill contains no restore call. A Time Travel restore overwrites the selected D1 database and is never an automatic remediation. Before any actual restore: stop writes, capture the current bookmark, identify the exact incident and tenant impact, obtain specific destructive-operation authority, document expected row/pointer effects, and prepare a post-restore reconciliation. If any item is missing, do not restore.

## Simulated failure and local restore

Automated tests build the full migration sequence locally, retain protected identities and relationships, make a post-backup change, restore the closed backup into a separate database file, and verify the original rows, integrity, and foreign keys. A separate reconciliation test injects an active-snapshot count mismatch and proves it fails before restore authority is considered.

Production drills are read-only plus optional append-only evidence. They do not simulate failure by damaging Production.

## Secrets and dependencies

- Cloudflare, Discord, session, and Companion secrets belong only in their environment's managed secret store.
- Use the narrowest token and shortest practical lifetime. Revoke or rotate a token after suspected exposure; never log or commit it.
- Keep Staging and Production bindings distinct and verify the target UUID returned by Cloudflare before every database action.
- Dependency changes require the same repository, secret, migration, tenant, and release gates as application changes. Do not install a new runtime dependency directly in Production.
- Treat a leaked export URL as a credential incident. Rotation is a separate commissioner action and is not part of ordinary recovery.

## Incident communication

The first update states the affected tenant and surfaces, when the issue began, whether live data remains safe, what actions are paused, and the next review time. Never include raw payloads, export URLs, cookies, tokens, personal Discord content, or internal stack traces. Follow-up updates distinguish confirmed facts from investigation. The closing update records cause, containment, exact repair/release, reconciliation result, whether any data changed, and remaining owner acceptance.

## Completion evidence

An incident or release is complete only after the exact runtime is identified, schema is verified, protected counts and foreign keys reconcile, active snapshot domains reconcile, alerts return to the expected state, and the outcome is recorded in the release evidence. Retain malformed, failed, previous, and active snapshots and their audits unless a separate retention operation explicitly authorizes removal.
