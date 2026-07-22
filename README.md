# Franchise HQ — TC-010.5 Game Center Tabs, Recap & Mobile Stability

## Game Center
- Removed the Overall / ratings comparison section between the score and game content.
- Added three Game Center tabs:
  - Team: game-level team statistics for completed games and matchup comparison for scheduled games.
  - Player: completed-game player box scores or pregame full rosters and current-year stats.
  - Recap: broadcast-style game recap presentation with score, headline, summary and the top three performers.
- Added season, week, date, time, network and stadium information to the upper-left Game Center header.
- Game switching remains available inside Game Center.
- Player entries continue to open the existing player experience.

## Recap approach
The recap is generated from structured Franchise HQ data rather than relying on a manual image:
1. Import the final score and player/team box-score data.
2. Rank game performers using configurable performance weights.
3. Fill a reusable broadcast template with team colors, marks, score, headline and top performers.
4. In production, export the recap DOM element to PNG using a browser renderer such as html-to-image or a server-side screenshot worker.

This build includes the full on-screen recap design and an export action placeholder for the production PNG service.

## Mobile
- Removed the conflicting pointer-down navigation listener.
- Added one guarded click handler for opening the sidebar.
- Added a short toggle lock and persistent open-state class so the menu no longer opens and immediately disappears.

Replace all six files together.

Suggested commit:
`Add TC-010 Game Center tabs, broadcast recap, and mobile menu stability`
