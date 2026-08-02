# Franchise HQ v5.7.0 Validation

## 1. Version and console
Confirm the footer displays `v5.7.0` and no immediate red console errors appear.

## 2. Asset resolver registration
Run:
```javascript
({
  service: typeof FranchiseHQ.modules?.league?.tradeAssets,
  alias: typeof FranchiseHQ.tradeAssets,
  resolve: typeof FranchiseHQ.tradeAssets?.resolve,
  verifyOwnership: typeof FranchiseHQ.tradeAssets?.verifyOwnership,
  validateTransfers: typeof FranchiseHQ.tradeAssets?.validateTransfers
});
```
All values should be `object` or `function` as appropriate.

## 3. Diagnostics
Run:
```javascript
FranchiseHQ.tradeAssets.diagnostics();
```
Expected: version `5.7.0`, rosterService `true`, healthy `true` in Development mode.

## 4. Existing two-team trade regression
Open Trade Center and confirm normal two-team offers, history, committee review, Trade Block and AI Suggestions still open.

## 5. Open multi-team builder
Open Trade Center and click `Build multi-team trade`.
Expected: your franchise appears as the first participant and a second franchise can be added.

## 6. Add teams
Add a third team and then a fourth team.
Expected: four teams maximum. The Add Team control becomes unavailable at four.

## 7. Directed transfers
For each participant, select an asset and a different recipient.
Expected: the transfer reads like `Asset → Recipient`.

## 8. Flow validation
Expected: the Send button remains disabled until every participating team sends at least one asset and receives at least one asset.

## 9. Duplicate protection
Try adding the same player or pick more than once.
Expected: validation reports a duplicate asset and submission remains blocked.

## 10. Ownership protection
Use the console to validate a player against the wrong team:
```javascript
const p = FranchiseHQ.leagueRosters.searchPlayers('')[0];
FranchiseHQ.tradeAssets.verifyOwnership({type:'player',id:p.id}, 'wrong-team');
```
Expected: ownershipValid `false`, available `false`.

## 11. Submit a three-team trade
Create a valid three-team directed trade and submit it.
Expected: the detail screen shows all three franchises, what each sends, what each receives, and acceptance status.

## 12. Owner acceptance
Switch identities to each participating owner and accept the exact trade.
Expected: acceptance count increases. After the final owner accepts, status changes to Committee Review.

## 13. Four-team trade
Repeat with four franchises.
Expected: all four packages render and all four acceptances are required.

## 14. Visibility
Switch to an uninvolved owner.
Expected: the multi-team trade is unavailable to that owner. Commissioners can view it.

## 15. Final regression
Confirm no red console errors while using normal trades, multi-team trades, Commissioner HQ, Rosters, Schedule, Standings and Statistics.
