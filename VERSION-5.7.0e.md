# Franchise HQ v5.7.0e

## Live Trade Valuation & Trade Limit Controls

This hotfix adds a real-time Fair Trade Calculator to the unified Private Trade Builder and introduces Commissioner-controlled seasonal trade credits and outgoing asset thresholds.

### Default rules

- Seasonal limit enforcement: Enabled
- Trade credits per team: 4
- Players per trade credit: 3
- Picks per trade credit: 3

Each participating team's outgoing package is calculated independently. The larger of the player-unit or pick-unit calculation determines that team's cost.

Examples:

- 3 players and 3 picks sent: 1 credit
- 4 players and 1 pick sent: 2 credits
- 2 players and 5 picks sent: 2 credits
- 7 players and 2 picks sent: 3 credits

Disabling seasonal enforcement allows unlimited trading while retaining asset-cost previews.

Approved trades remain administrative records only and do not alter League Data or site rosters.
