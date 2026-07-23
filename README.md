# Franchise HQ — TC-011.3.1 Unified Player Cards

Built from the accepted TC-011.3 Commissioner HQ baseline.

## Preserved

- Developer Mode and identity switching.
- Trade Center and accepted trade workflows.
- Commissioner HQ and commissioner-only navigation.

## Player Card changes

The Trade Center player valuation card is now the single player-card experience throughout Franchise HQ.

Clicking a player opens the card over the current screen without changing routes. This applies to Teams, My Team, Player Database, League Home, League Activity, Stats & Leaders, Game Center, Schedule, Trade Center, Trade Block, Command Search, and Commissioner HQ.

The card includes:

- A contextual close action such as `← Teams`, `← Trade Center`, or `← Game Center`.
- An X button in the top-right corner.
- Closing either control reveals the exact page or modal underneath.
- Existing filters, tabs, negotiations, and scroll position remain intact.

Replace all six files together.

Suggested commit:

`Apply TC-011.3.1 unified contextual player cards`
