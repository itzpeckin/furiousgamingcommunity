# Franchise HQ v5.8.5 Validation

## 1. Version and console

1. Upload the replacement files.
2. Hard refresh with `Ctrl + Shift + R`.
3. Confirm the site loads without red console errors.

## 2. Removed subtitle

Open League Home.

Expected:

- `League Home` remains.
- The sentence `Your weekly franchise command center for matchups, standings, news, and league leaders.` is gone.
- The header does not leave a large empty gap.

## 3. Desktop layout

At a wide desktop width:

- League Headlines remains above the schedule.
- Schedule remains horizontally usable.
- Matchup, standings, and Stat Leaders retain the validated design.
- AFC and NFC cards remain consistent in height.
- All four leader cards remain aligned and readable.
- No horizontal page scrollbar appears.

## 4. Standard laptop

Resize the browser to approximately 1280–1360px wide.

Expected:

- Matchup and standings remain readable.
- Long team and player names truncate cleanly instead of breaking the layout.
- Standings columns remain aligned.
- Leader controls remain inside their cards.

## 5. Tablet

Resize to approximately 800–1100px wide.

Expected:

- Standings move beneath the matchup in two columns.
- Leaderboards display in two columns.
- No cards overlap.
- No horizontal page scrolling appears.

## 6. Mobile

Resize below approximately 780px.

Expected:

- Header actions remain usable.
- Matchup teams stack cleanly.
- Standings become one column.
- Leaderboards become one column.
- Schedule remains horizontally scrollable.
- No text or controls are cut off.

## 7. Interactions

Validate:

- Headline ticker pauses only on hover/focus and resumes afterward.
- Schedule tiles visibly highlight on hover.
- Clicking a schedule game updates the matchup.
- Team rows open Team pages.
- Player rows open Player Cards.
- `View Full Leaderboard` opens the Stats page.

## 8. Regression

Confirm no layout or behavior changes in:

- Trade Center
- Commissioner Controls
- Team pages
- Schedule page
- Stats page
- League Data modes
- Navigation
