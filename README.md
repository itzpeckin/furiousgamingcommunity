# Franchise HQ — TC-005.1 Hotfix 3

This stabilization build fixes the active-proposal withdrawal action and improves counteroffer change visibility.

## Fixes

- The current proposer can now withdraw and close an active negotiation from any matching franchise identity, including the commissioner identity for that franchise.
- Withdrawal uses a dedicated click handler so the action cannot be swallowed by other Trade Center controls.
- Unauthorized withdrawal attempts now display a clear explanation instead of silently doing nothing.
- The `NEW` badge is now bright green and the entire added asset row receives a green highlight.
- When the reviewing owner opens a counteroffer, each team package shows a `REMOVED` note listing assets that were present in the previous version but are absent from the current version.
- Withdrawing closes the negotiation while preserving versions, messages, notifications, and activity history.

## Acceptance test

1. Submit an offer as Owner A.
2. Confirm Owner A can use **Withdraw and close negotiation**.
3. Submit another offer, switch to Owner B, and send a counteroffer.
4. Confirm Owner B can withdraw the latest counteroffer.
5. Switch to Owner A and confirm Owner A cannot withdraw Owner B's active counteroffer.
6. Confirm Owner A sees green `NEW` tags on added assets.
7. Confirm a `REMOVED` note appears beneath the appropriate team package when an asset was removed from the preceding version.
