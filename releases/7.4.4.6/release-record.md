# FranchiseHQ 7.4.4.6 Release Record

## Scope

Refine the connected global FranchiseHQ Discord bot from real FGC acceptance findings. Give commissioners verified server-channel routing, make current schedule rollover automatic and safe, replace indirect lookup parameters with tenant-scoped autocomplete, correct cumulative team/player statistics, restore current GM History, broaden Leaders, and return rich Player/Trade Block results.

## Added during delivery

- **Commissioner-owned channel routing:** Commissioner HQ lists verified existing text channels from the connected Discord server and saves separate schedule, Trade Committee, and optional league-notification destinations. The selection is tenant-scoped and audited; commissioners do not enter raw Discord IDs.
- **Safe automatic schedule rollover:** a live import creates and verifies every new active-week matchup thread first. Only after the complete replacement succeeds does FranchiseHQ delete older bot-tracked schedule threads. Failed or partial replacements retain the prior schedule, while D1 lifecycle rows remain as audit history.
- **Direct command UX:** Standings and Schedule accept one direct autocomplete choice for league, conference, division, team, season, or week. Player, Trade Block, GM History, Rules, Leaders, trade participants, roster assets, picks, and actionable trades also use tenant-scoped autocomplete.
- **Dedicated statistics commands:** `/player-stats` reports cumulative Franchise statistics grouped by available season; `/team-stats` reports one exact team's current-season totals. `/stats` remains compatible. Additive metrics are summed, longest values use maxima, and completion percentage, passer rating, yards-per-attempt, and kicking percentage are derived from cumulative inputs rather than summed.
- **Expanded Leaders:** passing, rushing, receiving, defense, kicking, and punting leader metrics include source-backed touchdowns, receptions, interceptions, tackles, sacks, fumbles, and specialist categories.
- **Rich Discord previews:** Player lookup and Trade Block results include canonical FranchiseHQ links plus team, position, overall, age, development, current-season highlights, and looking-for details.
- **Current GM History:** live completed games are attributed through reviewed person-owned ownership periods and combined with archived GM season summaries, so commissioners do not have to archive the season before current records appear.
- **Command repair:** connection/reconfiguration uses non-destructive name upserts for every current definition, updating changed schemas without bulk deletion of the legacy week commands.

## Known inherited blockers

Madden Free Agents remain blocked upstream and unknown/null; this Discord release does not interpret that state as zero. Durable career summaries for seasons not retained in the active canonical statistics source remain part of later canonical consistency work rather than being fabricated by Discord.

## Root cause corrected

Discord's snapshot team adapter did not carry the canonical team key. Team filters compared two missing keys as equal, which admitted league-wide player-stat rows and produced the reported impossible totals. The shared Discord read model now enriches snapshot teams with canonical tenant team identity before any standings, schedule, statistics, player, or GM operation.

## Validation evidence

Focused Discord validation passes 21/21 tests. It covers exact team scoping, cumulative rate derivation, preseason exclusion, season-level player output, multi-metric Leaders, rich embeds, signed autocomplete without receipts, current-season GM attribution, verified channel selection, command-schema repair, create-first schedule rollover, and failed-rollover preservation. The complete strict local repository suite passes 190/190 tests after generated inventory refresh.

## Deployment status

Exact candidate `c42ac38b0b98f427c40da8233ed0b02b9bfaa807` was published through PR #49 with all four candidate checks passing. It merged to Main as `e2f596dd9cbc8f0f5f3086e65c6f1cb15aeb6d91`; all five Main quality, build, and deployment checks passed. Cloudflare Pages Production deployment `06c0ba8d-18ec-42e6-b544-b950e5fc5e42` succeeded for `franchisehq.app`, and authenticated read-only acceptance reports release 7.4.4.6.

The complete 36-command definition set—18 direct/autocomplete experience commands and `/week1` through `/week18`—was dispatched through the existing encrypted Production bot secret using individual name upserts, never global bulk overwrite. Reaffirming the existing verified routing preserved `#franchisehq-schedule` and direct-message delivery for Trade Committee and league notifications; it produced the expected installation-update and audit rows at `2026-09-07 00:34:41` without changing any destination. Because the encrypted token is intentionally unavailable to local tooling, final command behavior remains pending owner acceptance inside Discord rather than being claimed from a separate token-based inventory request.

Read-only Production D1 acceptance confirms migration 35; 1 league; 29 users; 29 memberships; 28 active team assignments; 14 retained snapshots; unchanged active snapshot `31b52bdc-ce62-479e-83c3-36a75eeb2b12` at Regular Season Week 13; 672 draft picks; 1,344 draft-pick ledger events; 3 trade workflows; 14 active schedule threads; and zero foreign-key violations. The authenticated Commissioner HQ shows the connected FGC guild, 26 registered Discord identities, the verified channel selectors, and the expected 14 matchup threads.

No migration, import, active-snapshot change, reset, protected-data deletion, archive, season transition, export-URL rotation, credential change, membership/team-assignment change, or channel-destination change was performed. Madden Free Agents remain blocked and unknown/null, never zero.

## Rollback

Redeploy exact 7.4.4.5 Main merge `6c5cc23bace756f269247974089b8a4086e69192`; migration 35 remains in place. If command-schema rollback becomes necessary, perform an explicitly authorized name-upsert reconciliation using the 7.4.4.5 definitions—never bulk delete or overwrite unrelated commands. Preserve the existing Discord application, encrypted bot token, guild mapping, memberships, assignments, active snapshot, league data, export URL, history, and blocked/null Free Agent state.
