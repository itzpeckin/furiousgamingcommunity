# FranchiseHQ 8.2.33

## Scope

Remove the scheduling opening-post playoff legend, retaining only status icons beside team names and records. Investigate the latest FGC export/import and reduce repeated storage round trips.

## Added during delivery

The latest recorded import took 166,959 ms versus 43,497 ms for the earlier comparable import. Its statistics mapping took 30.5 seconds, snapshot build 61.9 seconds and validation 14.7 seconds. The latest EA collection spanned 223 seconds: 18.3 seconds in measured provider calls and 203.6 seconds in collection processing (including provider calls). These timings locate most delay inside FHQ processing/storage, but do not independently prove a specific database location or provider outage.

EA retention now atomically inserts, links and resolves each exact capture in one D1 batch, preserving older deduplicated identities. The batch flushes one request-local manifest before saving its cursor or finalizing. Failed transactions/manifest writes remain replayable. Finalization fetches all scoped capture metadata once, retaining bounded payload reads and missing-payload checks. Numeric storage timing is now recorded alongside provider timing.

Snapshot construction batches at most four existing 500 KB SQL payloads per database round trip; every write must succeed before checkpoint advancement. Statistics mapping reuses its authorized run within the existing four-route request and reads independent final summaries concurrently. No validation, source-period, tenant, stale-snapshot, roster or player-identity checks are removed.

Pages Smart Placement is enabled in preview with all other settings verified preserved. It will be enabled for production with this release after checks pass, to reduce regional storage latency. Its effect on a real import remains to be measured. Official references: https://developers.cloudflare.com/pages/functions/smart-placement/ and https://developers.cloudflare.com/d1/worker-api/d1-database/.

Scheduling gets a new deterministic presentation revision so completed jobs cannot swallow the legend removal. Thread names and conversation/message IDs remain unchanged.

## Known inherited blockers

No authenticated browser is attached. Existing Discord post refresh and a fresh production export/import require a commissioner-triggered run. The last completed job cannot be restarted with expired authorization. Do not report current posts refreshed or a sub-80-second production result until verified. No new collection/import has been run during this investigation.

## Validation evidence

The full-season fixture retains identical 10,653 records, including 272 games and 8,271 statistics. Snapshot write round trips fall from 16 to 8 with the same existing server request sizes. EA tests cover atomic rollback, legacy capture identity, failed manifest flush/replay and flush-before-publication. Ninety existing import/EA tests passed before the additional regressions. Full strict gate and hosted verification required before publication.

## Deployment status

Authorized candidate. Schema 56 and separate Workers unchanged. Only preview placement has changed during candidate preparation; no customer data mutation.

## Rollback

Restore Pages 8.2.32 deployment 6308e8a1-68c4-4fce-a0fa-79a7b37c5f01. If placement regresses request latency, restore placement mode off in the affected environment and redeploy. Preserve all captures, manifests, snapshots and conversations. No database or separate Worker rollback.

Local release gate completed: all 702 tests and strict checks passed. Full-season snapshot data remained identical; interrupted-storage and prior-presentation upgrade regressions passed.
