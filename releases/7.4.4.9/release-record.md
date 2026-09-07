# FranchiseHQ 7.4.4.9 Release Record

## Scope

Repair the Production-shaped Discord game/team-stat behavior accepted for follow-up after 7.4.4.8, make schedule-thread synchronization safely idempotent within a week, complete the requested Standings and Playoff Hunt command experience, and improve Discord Trade Center communication without changing league data.

## Added during delivery

- `/standings Division` returns all 32 teams grouped into eight divisions; `/standings Conference` returns all 32 grouped into AFC and NFC; a team name returns only that team; and a direct phrase such as `Division NFC East` returns the four teams in that division. The same views remain available through autocomplete.
- `/playoffs` returns the top 10 teams in each conference, with seeds 1–7 identified as the current playoff field and positions 8–10 labeled **In the Hunt**. AFC or NFC can be selected directly.
- Missing Madden `season_year` values remain null/unavailable rather than coercing to zero. This keeps legitimate Production Week 14 schedule and team-game records in the active-season read model. Scheduled status—including Madden status `1`—wins over a 0–0 score pair, so `/games` does not report unplayed games as finished.
- The website Season Team Statistics table now adds every team-scoped regular-season `team-game` record and derives rates from accumulated numerators and denominators. It no longer selects only the newest weekly record.
- Repeated same-week imports reuse the existing Discord thread for the same canonical season, phase, week, home team, and away team even if Madden changes the external game ID. A true week advance still creates the complete new schedule before deleting earlier FranchiseHQ schedule threads.
- Discord results use named Markdown links instead of presenting long raw FranchiseHQ URLs.
- Initial and revised trade offers notify both the sending owner and receiving owner(s). Private DMs include linked players, position, overall, age, development trait, source-backed cap hit, projected draft slot when standings support it, and a clearly labeled cap estimate that excludes Madden dead-cap and bonus acceleration effects.
- `/trade-block view`, `/trade-block add`, and `/trade-block remove` provide direct league viewing plus private, roster-authorized owner management. Add accepts an optional Looking For note; Remove autocomplete is limited to the owner's current listings.

## Known inherited blockers

Madden's Free Agent route remains blocked upstream. Its count remains unknown/null and is not interpreted as zero. Tackle-for-loss is not present in the current FGC player-stat source and is not fabricated. Discord cap impact is an estimate because the retained source does not expose every Madden dead-cap and signing-bonus acceleration rule.

## Validation evidence

Focused Discord coverage passes 29 tests for exact standings modes, both-conference playoff hunt, null-season Production rows, scheduled 0–0 games, additive team metrics, player search, owner trade resolution, sender/recipient notifications, rich private DMs, Trade Block permissions, same-week thread reuse, safe week rollover, tenant isolation, interaction signatures, and replay protection. The complete strict repository result is recorded in `validation-evidence.json`.

## Deployment status

Local candidate only. Branch publication, pull request creation, hosted checks, global Discord command reconciliation, Main merge, and Production deployment have not been authorized or run. Migration 35 remains current and 7.4.4.9 adds no migration. No command was invoked in the live FGC Discord server and no Production row was written.

## Rollback

Return the application code to exact source baseline `9650294f4802b425223b2b7a65ef91fb204232c9`. Migration 35 remains current. Preserve the active snapshot, every retained snapshot and audit, Discord installation/routing, permanent export URL, memberships and assignments, all trade and draft-pick records, and blocked/null Free Agent evidence.
