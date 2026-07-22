# Franchise HQ — Sprint TC-004

TC-004 introduces the full private Trade Builder and the League Timeline Engine while preserving all validated TC-001 through TC-003 behavior.

## Trade Builder

- Searchable asset browser on both sides of the trade
- All / Players / Picks filters
- Position filters for roster assets
- Quick-add controls with live valuation
- Selected-package area with individual remove controls
- Clear-side action
- Live roster-spot and outgoing-cap summaries
- Real-time package-adjusted fairness calculation
- Offer-readiness validation
- Private draft saving, offer submission, and revision workflow
- Existing player cards and compact draft-pick cards remain available

## League Timeline Engine

The commissioner now controls a shared league year, week, and phase. Draft picks are valued by their distance from the current league year rather than by hardcoded calendar years.

Retention curve:

- Next draft: 100%
- Two drafts away: 65%
- Three drafts away: 40%

Example: when the league year moves from 2026 to 2027, the 2028 draft automatically becomes the next draft and receives the 100% retention rate.

## Model versions

- League Valuation Engine 1.1
- Package Engine 1.1
- Draft Pick Engine 1.2
- Trade Builder 1.0
- League Timeline Engine 1.0

## Acceptance tests

1. Trade Center loads for commissioner and owner accounts.
2. Start Private Trade opens the new builder.
3. Search, asset-type, and position filters work independently on each side.
4. Clicking an asset adds it once and recalculates both package totals.
5. Removing an asset and clearing a side work.
6. Player and draft-pick cards still open and close correctly.
7. Save Private Draft and Send Private Offer still work.
8. In Commissioner Dashboard, change League Year from 2026 to 2027.
9. Confirm a 2028 pick changes from two drafts away at 65% to the next draft at 100%.
10. Account switching, Trade #104, committee review, and Trade Block continue to work.
