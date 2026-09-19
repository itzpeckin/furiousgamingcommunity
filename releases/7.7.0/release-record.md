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

Exact candidate `82a2eab02ed6a761b510736005be3c3e48fae3b5` passed all three pull-request checks in [PR #127](https://github.com/itzpeckin/furiousgamingcommunity/pull/127) and merged to Main as `4391efbd2f3cb780f019ff295ef0c7e263ab26eb`. Main quality run `35410456767` and Pages run `35410455878` passed. Production Pages deployment `4391efbd2f3cb780f019ff295ef0c7e263ab26eb` and import Worker build `e5e8cadd-9706-4ce0-8b08-78e63c9c30ca` / version `f14d368d-25ed-4aa0-9f82-4bb4ad65d05c` serve the exact merge. No migration or Discord command registration was required.

Signed-in read-only acceptance confirms release 7.7.0, Season 2027 Regular Season Week 2, active snapshot `5cee59c2-1610-4e70-8a65-2707a40da95a`, and Free Agents still unknown. The Discord Command Center alert now opens Audit → Platform Health → Discord Deliveries. Five retained failures remain visible, including two eligible commissioner retries; no retry was selected and no live trade was manufactured. A pre-deployment private candidate remains stopped at Build Import Snapshot, while the prior active snapshot stays live exactly as designed. The next natural trade lifecycle is the remaining interaction acceptance.

The release performed no Madden export/import, snapshot activation, reset/delete, export-URL rotation, season archive/transition, scheduling-thread action, roster/ownership change, credential change, Discord command registration, live Discord retry, or Free Agent reinterpretation.

## Rollback

Redeploy the accepted 7.6.0-rc.1 Main commit. Migration 45 and all retained Discord delivery events, destination attempts, trade messages, audits, snapshots, captures, and league records remain in place. Do not restore D1, delete failure evidence, recreate trade threads, reset data, rotate the export URL, archive/transition a season, request another Madden export, or reinterpret blocked Free Agents.
