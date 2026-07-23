# Franchise HQ — TC-011.2 Design System & Typography Refresh

This sprint standardizes readability and spacing across the full Franchise HQ application before Commissioner HQ development begins.

## Typography system

The application now uses a consistent platform-wide type scale:

- Micro labels: 10px
- Secondary text: 11–12px
- Standard body text: 14px
- Primary row and player names: 14–16px
- Card titles: 16–18px
- Section headings: 18–22px
- Page and hero titles: 24–30px

The previous 6px–8px text has been eliminated from the primary application experience.

## Spacing system

Updated globally:

- Card padding
- Table and roster row heights
- Button height and hit areas
- Input fields
- Tabs
- Navigation
- Modals
- Drawers
- Mobile menu
- Game Center
- Recap Studio
- Trade Center
- Team and player pages
- League Home

## Readability improvements

- Larger sidebar and navigation labels
- More readable standings and schedule cards
- Larger team, player, and transaction rows
- Improved modal and drawer typography
- Better mobile hit targets
- Larger Game Center tabs and player statistics
- More readable generated recap text and top-performer cards

## Discord direction

The generated story remains available in the current recap model, but the long-term publishing workflow is now defined as:

Imported game result
→ generated recap and media
→ Franchise HQ Discord integration
→ automatic post to a selected league channel

The Discord connection is intentionally deferred to a dedicated integration sprint.

Replace all six files together.

Suggested commit:
`Apply TC-011.2 typography and design system refresh`
