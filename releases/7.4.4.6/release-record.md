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

Local implementation is complete on `codex/franchisehq-7.4.4.6`; publication, pull request, hosted checks, Main, Production deployment, global command reconciliation, and saved Production channel routing are not yet authorized or performed. Migration 35 remains current and no schema change is required.

No import, active-snapshot change, reset, deletion, archive, season transition, export-URL rotation, credential change, membership/team-assignment change, Production Discord command registration, or Production channel-setting operation was performed. Madden Free Agents remain blocked and unknown/null, never zero.

## Rollback

Before publication, discard only the 7.4.4.6 candidate branch. After any future authorized deployment, redeploy exact 7.4.4.5 Main merge `6c5cc23bace756f269247974089b8a4086e69192`; migration 35 remains in place. Preserve the existing Discord application, encrypted bot token, guild mapping, memberships, assignments, active snapshot, league data, export URL, history, and blocked/null Free Agent state.
