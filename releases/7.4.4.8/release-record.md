# FranchiseHQ 7.4.4.8 Release Record

## Scope

Refine the global FranchiseHQ Discord experience around three direct actions: current-week game status, complete player/team statistics, and registered-owner trade creation. This is a code-only application release with an authorized global command reconciliation; it does not migrate or mutate league data.

## Added during delivery

- `/games` now owns current active-week status and visibly separates Played from Unplayed matchups. `/schedule` remains the direct season/week/team schedule lookup.
- `/player` supports case-insensitive substring autocomplete and direct partial-name execution. It can return several matches for input such as `Chase`, links each result to the current FranchiseHQ Player Card, and groups every source-backed metric available for that player's position and franchise season.
- The player statistics model covers actual Production passing, rushing, receiving, defense, kicking, and punting keys. Cumulative percentages and rates are derived from their numerators and denominators instead of summing weekly rates. Madden's retained FGC feed does not expose tackle for loss, so 7.4.4.8 does not fabricate it.
- `/team` resolves one canonical team and aggregates only that team's active-season `team-game` rows. It returns source-backed scoring, offense, conversion, red-zone, defense, possession, and discipline totals with derived rates.
- `/trade create` selects only active, assigned FranchiseHQ owners. Autocomplete identifies each counterparty by full team, abbreviation, Discord snowflake, and username; send/receive player and pick choices stay scoped to the resolved teams.
- The registered surface retires `/stats`, `/player-stats`, and `/team-stats`. Publication first upserts every current command and then deletes only those exact legacy names, preserving `/week1`–`/week18` and any unrelated application command. Legacy interaction handlers and team-key trade tokens remain accepted during Discord propagation.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero. Tackle-for-loss is not present in the current FGC player-stat source and therefore cannot be displayed truthfully.

## Validation evidence

Focused Discord tests cover the 35-command manifest, safe exact-name retirement, substring player autocomplete, rich position-stat embeds, authoritative team totals, current-week Played/Unplayed grouping, full Discord owner identity selection, counterparty resolution, and team-scoped trade assets. The full strict repository gate and read-only Production observations are recorded in `validation-evidence.json`.

## Deployment status

Exact candidate `32ec52d3f1b419def572dd755b4340a06ff7bda4` was published through PR #51 after all four candidate checks passed. PR #51 merged to Main as `7b3437cbd6a7e32de18848ebb30b8b5a24ed3062`; all Main quality, build, and deployment checks passed. Initial Cloudflare Pages Production deployment `973b3766-f43d-4e7c-8ed2-6cfcd6cc0685` succeeded.

The authorized global command reconciliation used the existing encrypted Production `DISCORD_BOT_TOKEN` without reading or changing it. Its first isolated Pages build attempt `6de308c8-bc2c-4c45-be5e-83e333ace697` received Discord HTTP 429 and stopped safely without replacing the live deployment. The bounded rate-limit retry succeeded in Pages deployment `61657d1c-6e61-477d-b1c8-742b23d6dfa0`: 35 current global FranchiseHQ commands were upserted, `/stats`, `/player-stats`, and `/team-stats` were retired by exact name, all 18 `/week1`–`/week18` commands were preserved, and no unowned command was bulk-deleted. The temporary registration build hook was removed; the Production build command is the documented no-op `exit 0`, so future deployments do not repeat command reconciliation.

Authenticated live acceptance at `franchisehq.app` confirmed FranchiseHQ 7.4.4.8 in the existing FGC commissioner context at Season 2026 / Regular Season Week 14. Read-only verification against `franchise-hq-db-madden27` confirmed migration 35, one league, 30 users, 30 memberships, 28 active team assignments, one active pointer, 16 retained snapshots, and zero foreign-key violations. Active snapshot `23dd264d-d8e9-4643-9c41-e37f039ab27d` remains unchanged with 32 teams, 2,036 rostered players, 256 games, 10,828 statistic records, 32 standings, validation-ready status, and three retained warnings. The Discord installation, 15 active schedule threads, and token-version-1 permanent export endpoint also remain unchanged. Verification wrote zero database rows.

## Owner acceptance

Independent Discord behavior remains for the owner to confirm using `/games`, a partial search such as `/player Chase`, an exact team query such as `/team Buccaneers`, and `/trade create`. Those commands read the existing league state; this release did not invoke commands in the league server or create a trade.

## Rollback

Return the application code to exact source baseline `3b64d02b47853e9470bbe88185196a5a47588532`. If a Discord schema rollback is separately authorized, upsert the exact 7.4.4.7 owned-command definitions without bulk-deleting weekly or unowned commands. Migration 35 remains current. Preserve the active snapshot, all retained snapshots and audits, the permanent export URL, memberships and assignments, Discord configuration, and blocked/null Free Agent evidence.
