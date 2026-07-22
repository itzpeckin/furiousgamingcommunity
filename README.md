# Furious Gaming Community — Franchise HQ

## Sprint TC-002: Package Engine

This release adds package-level valuation on top of the validated TC-001 player valuation card.

### Included
- TC-001 large player cards and individual valuation breakdowns.
- DEV-001 Developer Mode and role switching.
- Package Engine 1.0 with elite scarcity premium, best-player premium, package dilution, roster-spot cost, and asset-mix adjustments.
- Fairness percentages now use adjusted package totals rather than only adding individual asset values.
- Authorized users can expand a compact package-adjustment explanation under the fairness meter.
- The fairness bar remains non-clickable and player names are not repeated in the calculation panel.

### Acceptance test
1. Open Trade #104 and confirm the fairness panel displays package-adjusted totals.
2. Expand “View package-engine adjustments.”
3. Confirm each side shows raw value, adjusted value, and any applicable adjustments.
4. Open the private trade builder and add three or more assets to one side.
5. Confirm the fairness calculation changes when package dilution and roster costs apply.
6. Click a player in the trade package and confirm the TC-001 player card still opens.

Mock data remains in use until Madden export integration.
