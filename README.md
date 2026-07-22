# Franchise HQ — TC-010.4 Game Center & Mobile Fixes

This integrated build addresses the latest League Home and mobile issues.

## League Home
- League News now lives directly beneath the Game of the Week in the left content column.
- The previous large whitespace caused by the taller standings column is removed.
- The middle Game of the Week rail and Open Game Center button are removed.
- Clicking the Game of the Week panel opens Game Center.

## Game Center
- Fully redesigned with team colors, large team identity marks, score treatment, and Franchise HQ styling.
- Dedicated visible close button.
- Backdrop and close controls both dismiss Game Center.
- Weekly game switcher allows users to move between games without closing Game Center.
- Upcoming games show full rosters and current-year player stats.
- Completed games show category box scores for:
  - Passing
  - Rushing
  - Receiving
  - Defense
  - Special Teams
- Player names inside Game Center open the existing player experience.

## Mobile
- Mobile navigation button now has a direct pointer/touch handler.
- Layering and pointer-event rules were corrected so the menu button remains clickable.
- Mobile Game Center layout is responsive.

Replace all six files together.

Suggested commit:
`Fix TC-010 Game Center, spacing, completed stats, and mobile navigation`
