# Franchise HQ v5.7.0c Validation

## 1. Confirm release

Expected footer:

`v5.7.0c · Trade Detail Routing Hotfix`

Confirm no immediate red console errors.

## 2. Submit a three-team trade

Build a valid transaction where every team sends and receives at least one asset.

Expected:

- Submission succeeds.
- The transaction detail opens immediately.
- All three teams and directed assets display.
- `Trade could not be loaded` does not appear.

## 3. Confirm the URL and stored ID

Run:

```javascript
const routeId = location.hash.split('multi-')[1];
const saved = FGC_TRADE.multiTrades().find(
  trade => String(trade.id).toLowerCase() === String(routeId).toLowerCase()
);
({ routeId, savedId: saved?.id, found: Boolean(saved) });
```

Expected: `found: true`.

## 4. Reopen from Trade Center

Return to Trade Center and open the submitted trade again.

Expected: the same transaction loads successfully.

## 5. Switch participant identities

Switch to each participating owner and reopen the transaction.

Expected: every participant can view it. Unrelated owners cannot.

## 6. Commissioner visibility

Switch to a Commissioner identity.

Expected: the Commissioner can open the trade.

## 7. Draft persistence regression

Create another unfinished trade, click Back, and test:

- Continue Editing
- Save as Draft
- Discard Changes
- Clear Trade

Expected: all v5.7.0b behaviors remain intact.

## 8. Roster protection

Submit and approve a test transaction.

Expected: visible rosters, depth charts, cap tables, and player team assignments remain unchanged until a Madden Companion import reflects the trade.
