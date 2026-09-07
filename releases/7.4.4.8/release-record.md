# FranchiseHQ 7.4.4.8 Release Record

## Scope

Refine the global FranchiseHQ Discord experience around three direct actions: current-week game status, complete player/team statistics, and registered-owner trade creation. This is a code-only local candidate. It does not register commands, deploy an application, or mutate league data.

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

Local implementation and validation only. GitHub publication, pull request, hosted checks, merge to Main, Production deployment, and global Discord command reconciliation have not been authorized or run. Migration 35 remains current and no candidate migration is required.

Read-only verification against `franchise-hq-db-madden27` observed the commissioner-completed import at active snapshot `23dd264d-d8e9-4643-9c41-e37f039ab27d`, Season 2026 / Regular Season Week 14, with 32 teams, 2,036 rostered players, 256 games, 10,828 statistic records, 32 standings, 16 retained snapshots, and zero foreign-key violations. That import preceded and is outside this release's local changes; the verification wrote zero rows.

## Rollback

Return the code to exact source baseline `3b64d02b47853e9470bbe88185196a5a47588532`. Migration 35 remains current. Preserve the active snapshot, all retained snapshots and audits, the permanent export URL, memberships and assignments, Discord configuration, and blocked/null Free Agent evidence.
