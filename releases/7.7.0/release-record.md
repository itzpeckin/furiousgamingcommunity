# FranchiseHQ 7.7.0

## Scope

Promote the accepted private FGC release candidate into the formal FGC Production launch while correcting the Discord delivery defects exposed during acceptance. Preserve FranchiseHQ as the authoritative trade system and repair only its retained Discord copies.

## Added during delivery

- Discord 429 responses now honor the returned `retry_after` delay through bounded in-request retries, with any remaining delay preserved by the durable outbox.
- A retained private trade thread that Discord archived is reopened in place before synchronization. Active negotiations remain open; terminal trades are returned to their archived and locked state after the final update.
- Repeated trade changes coalesce behind one pending synchronization intent, and copies already displaying the authoritative workflow stamp are not edited again.
- Destination-safe commissioner retries continue to target retained failed copies without replaying votes, creating a replacement trade thread, or deleting prior failure evidence.
- Discord delivery alerts now open Commissioner **Audit → Platform Health → Discord Deliveries**, where the failure reason and safe retry control actually live.

## Known inherited blockers

None are registered in the repository quality baseline. Existing unresolved Discord events remain retained until a commissioner explicitly retries an eligible exhausted trade synchronization. Deployment itself does not replay those events.

## Validation evidence

Focused Commissioner and Discord validation passes 61/61 tests, including archived active and terminal threads, Discord error 30046 retry timing, duplicate-update coalescing, unchanged-message suppression, retained failed-copy recovery, and alert routing. The complete repository and strict release gate passes 273/273 tests, 279 JavaScript modules, 124 required tables, the environment/secret/asset checks, generated system inventory, and the release contract. No Production, league-data, Discord, or database mutation is part of candidate validation.

## Deployment status

The exact 7.7.0 candidate is locally validated and authorized for branch publication, pull request, hosted checks, Main merge, and a code-only Production deployment. No migration or Discord command registration is required. Exact publication and Production evidence will be appended after the deployed Main commit is verified.

## Rollback

Redeploy the accepted 7.6.0-rc.1 Main commit. Migration 45 and all retained Discord delivery events, destination attempts, trade messages, audits, snapshots, captures, and league records remain in place. Do not restore D1, delete failure evidence, recreate trade threads, reset data, rotate the export URL, archive/transition a season, request another Madden export, or reinterpret blocked Free Agents.
