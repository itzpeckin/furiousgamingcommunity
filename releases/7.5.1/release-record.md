# FranchiseHQ 7.5.1 Release Record

## Scope

Correct the Discord two-team trade workflow before 7.6: preserve Madden cap-field provenance, allow unequal asset packages, prefer one shared private owner negotiation, and let the receiving owner accept or reject with buttons from either that private thread or a fallback Bot DM.

## Added during delivery

- Madden `capHit` remains the displayed Madden cap hit. `capReleaseNetSavings` is normalized independently and used only as the best source-supported acquiring salary and sending-team relief estimate. `capReleasePenalty` is normalized and shown separately as the sending team's retained penalty.
- Current and projected team cap space are shown only when the active Madden export provides authoritative current team cap room. The retained FGC Week 16 team records do not, so the candidate reports the package's estimated room change and leaves current/projected space unavailable.
- The six send slots and six receive slots are independently optional after the required first asset on each side. Automated validation proves a 2-for-1 package creates three authoritative trade assets.
- `/trade create` prefers one private server thread containing the Bot and both registered team owners. The thread contains the rich asset/cap summary and Accept Trade / Reject Trade buttons. Discord moderators with Manage Threads can also see private threads under Discord's platform rules.
- If private-thread creation or membership fails, the durable individual Bot DMs remain active and the receiving owner gets the same decision buttons. Button actions work from a DM without requiring a server-channel slash command.
- Every button is checked against Discord's signed request, the connected application, tenant, active membership, current team assignment, trade participant set, negotiating state, and exact trade revision. A proposing team cannot reject its own offer through the receiving-owner button.
- An accepted two-team offer moves directly to committee review and queues the existing committee-channel notice. A rejection closes the offer and updates the shared conversation; existing in-app notifications remain authoritative.
- Additive migration 37 adds only the durable `discord_trade_rooms` ledger. Existing trades, users, memberships, assignments, snapshots, Madden records, Discord credentials, channel choices, and delivery history are preserved.
- The bot-install permission request now includes Create Private Threads. Existing guilds that do not already grant it can continue through Bot DMs until a commissioner refreshes the installation permission.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is never interpreted as zero. This Discord-only workflow does not change, bypass, or resolve that Madden source limitation.

## Validation evidence

Focused Discord and Madden-source tests cover mixed retained currency units, 2-for-1 packages, shared thread creation, both registered owner memberships, rich decision components, receiving-team authorization, atomic committee transition, direct-message button acceptance, delivery fallback, and protected Free Agent semantics. Fresh database fixtures advance through migration 37 with foreign-key enforcement.

The complete repository suite and strict release gate are consolidated into the candidate validation evidence. No Production, Main, GitHub, Discord registration, guild permission, credential, membership, league-data, import, active-snapshot, archive, transition, reset, or export-URL operation was run during implementation.

## Deployment status

Production remains FranchiseHQ 7.5.0 on migration 36. Publication requires a separate owner authorization covering branch push, pull request, hosted checks, a Production D1 bookmark, verified additive migration 37, merge, Production code deployment, an exact non-destructive `/trade` command upsert, and read-only acceptance. Enabling shared private threads in the existing FGC server additionally requires refreshing the Bot's Create Private Threads permission; without that step, the release safely uses direct Bot DMs.

## Rollback

If future runtime acceptance fails, redeploy exact 7.5.0 source baseline `aac13741ea732623327341f407dc81cdd98e7950`. Leave additive migration 37 and any retained thread rows in place unless a separate recovery operation is authorized. Do not roll back or mutate trades, memberships, assignments, snapshots, imports, history, Discord credentials, permanent export URLs, or blocked/null Free Agent state.
