# Franchise HQ v5.7.3 Validation

## 1. Confirm release

Confirm the footer shows:

`v5.7.3 · Trade Notifications & Completed Trade Analytics`

Hard refresh and verify there are no immediate console errors.

## 2. Confirm Analytics tab

Open Trade Center and confirm Analytics appears after History.

Open Analytics and confirm:

- Completed league trades total.
- Signed-in team's completed-trade total.
- Season filter.
- Commissioner identities see Completed Trades by Team.
- Normal owners see only the league total and their own team total.

## 3. Validate completed-trade counting

Approve one two-team trade.

Expected:

- League completed total increases by one.
- Both participating teams increase by one.

Approve one three-team trade.

Expected:

- League completed total increases by one.
- Each of the three participating teams increases by one.

Cancel an approved trade as Commissioner.

Expected:

- The cancelled trade is removed from completed totals.

## 4. Validate season filter

Change the Analytics season filter.

Expected:

- League total updates.
- Team totals update.
- A season with no approved trades shows zero and a clean empty state.

## 5. New offer notification

Send a two-team trade.

As the recipient, confirm:

- Notification bell shows unread state.
- Menu contains a New trade offer notification.
- Clicking it opens the correct trade.
- The notification becomes read.

## 6. Counter or revised offer notification

Counter or modify a trade.

As the other participant, confirm a revised/countered offer notification appears and routes correctly.

## 7. Participant acceptance notifications

For a multi-team trade, have one participant accept.

Expected:

- Other participating owners receive an acceptance notification.

After all participants accept:

- Participants receive Awaiting Committee Review notification.
- Eligible non-recused reviewers receive Committee review required.
- Recused reviewers do not receive review-required notifications.

## 8. Final decision notifications

Approve one trade through committee.

Expected:

- All participating owners receive Trade approved.

Reject one trade through committee.

Expected:

- All participating owners receive Trade rejected.

## 9. Automatic invalidation notification

Cause a committee trade to become invalid due to an approved-asset conflict or exhausted trade limit.

Expected:

- Participants receive Trade automatically invalidated.
- Notification includes the reason.

## 10. Commissioner cancellation notification

Cancel an approved trade as Commissioner.

Expected:

- All participating owners receive Approved trade cancelled.

## 11. Mark all read

Create multiple unread notifications.

Open the notification menu and click Mark all read.

Expected:

- Unread count becomes zero.
- Bell unread indicator clears.
- Notifications remain visible as read records.

## 12. Direct trade-open read behavior

Create an unread notification, then open the matching trade from Sent, Received, Committee, Approved, or History rather than through the notification menu.

Expected:

- Matching notification becomes read.

## 13. Privacy and recusal

Confirm:

- Unrelated owners do not receive private negotiation notifications.
- Recused committee members do not receive review-required notifications.
- Participants do not receive notifications intended only for unrelated reviewers.

## 14. Regression

Confirm the following still work:

- Drafts
- Sent and Received
- Committee review
- Approved and Rejected
- Trade Block
- AI Suggestions
- History search
- Team Trade History
- Player Transaction History
- Two-, three-, and four-team negotiations
- Roster non-mutation

Final expected result: no red JavaScript application errors.
