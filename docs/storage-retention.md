# Storage and cost control

## Automatic policy

The private franchise-storage-maintenance Worker runs every ten minutes in bounded batches. Four independent dataset lanes share a 45-second budget, with at most 20 batches of 100 rows per dataset. The selected mapping is reused between chunks to avoid repeated full eligibility scans. Observe mode reports counts without changing records; apply mode archives eligible working rows. No public HTTP action exists. The Worker has only D1 and private R2 bindings, without Discord, EA or email credentials.

Eligibility requires a successfully published import older than seven days. Preserve the three newest mappings per dataset, the three newest published imports, active and previous snapshot references, and mappings used by any non-archived snapshot. Pause while any import, EA collection or game-year transition is unfinished. Failed or unpublished candidates are retained for troubleshooting.

Each batch writes a gzip recovery object named by its SHA-256 hash, reads and decompresses it, and verifies its hash before deleting exact matching D1 rows. Deletion and the retention count update share a D1 transaction. Mapping statuses prevent replay of partially archived working data. Interruptions resume at the remaining rows. Updated rows are retained.

## Preserved data

All league snapshots and snapshot records, archived seasons, player career statistics, GM history, ownership, trades and Discord records remain unchanged. Raw captured exports and snapshot-build plans remain unchanged in this first policy. Retention only covers companion_canonical_*_preview working rows for teams, players, games and statistics.

## Operating checks

Inspect storage_retention_runs grouped by kind: SUM(archived_rows), SUM(archived_bytes), pending/complete status and last_checked_at. The Worker logs only counts and elapsed time. Inspect its scheduled invocation failures if progress stalls. Disable apply to pause. Read current D1 database file size separately; removed logical rows are not proof that Cloudflare immediately reduces billed physical storage.

## Recovery

Recovery objects use import-working-archives/v1/<encoded league>/<kind>/<encoded mapping>/<hash>.json.gz. restorePreviewChunk validates scope, hash and schema, then inserts only missing original rows. Keep the mapping archived until every chunk has been restored and verified; the helper never changes replay status. Do not restore an entire database to recover one mapping or restore a deleted league. Recovery copies remain private without expiry in this release.

## Cost boundaries

This reduces duplicate database working data, not every source of operating cost. It adds bounded D1 deletes/reads and R2 object operations. Measure the actual deletion and compression totals before estimating savings. Season-history snapshot compaction needs a separate dependency review and is not enabled here.
