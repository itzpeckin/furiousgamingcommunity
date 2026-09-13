# FranchiseHQ 7.5.6.1

Status: Full strict gate passed; standing-authorized publication in progress.

## Scope

Every committed committee vote queues a durable refresh in the same database batch as its vote. The shared trade workflow is used by the website, Discord reviewer DMs, Trade Submit buttons and review slash command. Refresh all known delivered review cards and the owner thread from authoritative current-revision status/approval/rejection counts, without casting another vote or creating duplicate committee review posts. Preserve the existing team-colored asset cards, logos, fields and dividers.

## Added during delivery

Store posted message references in existing outbox payloads, recover older exact application/trade messages in known destinations with a bounded 200-message channel scan, and register signed clicked messages directly. Suppress owner duplicate notices, not committee-reviewer DMs. Remove terminal action buttons explicitly. Ignore deleted resources instead of recreating them. An unavailable destination does not prevent other copies from updating; the existing outbox retains failures for retry, awakened by later workflow actions or authenticated Trade Center/status loads. Discord permission/rate-limit failures can delay delivery; this is not a guarantee against Discord outages.

Detect votes arriving while rendering, editing or later in the fan-out, and converge using fresh counts with bounded retry. Permission-safe multipart messages retain their asset chunks and refresh final status/controls. An open, visible site review reads a small status response every five seconds without replacing asset cards or typed reason text. Finished review stops polling. Public approved trade counts remain correct while private reviewer identities/reasons remain protected.

## Validation evidence

Full strict gate passes 229/229 tests, 257 syntax modules, 76 routes, 23 canonical migrations and 116 required tables. Focused synthetic Discord/trade tests pass 57/57. Separate authentication/mobile acceptance passes 12/12. Regression scenarios cover each entry point, repeated/changing/abstaining votes, final approval, rejection/revision, concurrent early and late votes, partial API failure/retry, deleted messages, exact legacy discovery, multipart fallback and tenant-private status lookup. Hosted checks will be recorded after execution. No actual Production trade vote is used for acceptance.

## Known inherited blockers

Code-only, migration 40 unchanged. No Discord command registration, channel/role change, credential or membership edit, live import, snapshot move, reset, archive/transition, export URL rotation, or ownership correction. Blocked Free Agents remain unknown/null. Owner deferred representative new-season current-week/source validation until the next season; this patch makes no current-week/import/scheduling change.

## Deployment status

Standing-authorized branch/PR/hosted checks/Main/Production publication follows the full strict gate. Actual merge, deployment and read-only acceptance identifiers will be recorded after execution.

## Rollback

Redeploy exact prior Main `b810284b9b7a8e5299fae867d9a2cc670e89581f` without a reverse migration or data reset. Retain votes, outbox message references, snapshots, picks, transactions and audits. Do not replay votes or delete Discord resources during rollback.
