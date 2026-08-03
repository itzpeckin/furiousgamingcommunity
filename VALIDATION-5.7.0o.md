# Franchise HQ v5.7.0o Validation

## Preflight
1. Confirm the footer reads `v5.7.0o`.
2. Hard refresh.
3. Open the console and confirm no immediate red errors.
4. Reset all trade data from Commish HQ > Commissioner Controls > Trade Center.
5. Run `FGC_TRADE.tradeDataDiagnostics()` and confirm all trade counts and saved drafts are zero.

## Critical runtime checks
- Open AI Suggestions and confirm no `suggestionPick` or `teamPositionProfile` error.
- Open a 3-team trade and test Modify Trade, Counter, and Reject.
- Confirm no `modifyMultiTrade`, `counterMultiTrade`, or `declineMultiTrade` reference errors.

## Draft workflow
- Confirm Drafts is the first Trade Center tab.
- Create multiple incomplete trades and save each as a draft.
- Confirm each appears independently in Drafts.
- Open, edit, delete, and submit saved drafts.
- Confirm Create a New Trade always opens a blank builder.
- Refresh while actively editing and confirm the temporary recovery copy restores.
- Use browser Back while editing and confirm the unsaved-work dialog appears.

## Committee queue
- Confirm Committee filters: Needs My Review, Trades I Am In, Already Reviewed.
- Validate each filter with both two-team and multi-team trades.
- Confirm Blevins can vote when eligible and is recused when New England participates.

## Valuation controls
- Confirm Draft Pick breakdown says `Projected Draft Slot Value`.
- Confirm Package Engine Adjustments appears separately in Commissioner Controls.
- Change each package percentage and confirm live calculations update.
- Confirm visible terminology uses Trades instead of Credits.

## Asset reconciliation
- Submit two committee-review trades containing the same outgoing player.
- Approve the first.
- Confirm the second is automatically cancelled and removed from the actionable committee queue.
- Confirm a trade that exceeds a participant's remaining trade limit is cancelled before additional committee action.

## Commissioner tools
- Click an approved trade from Teams & Owners and confirm its assets open inline.
- As Commissioner, cancel one approved trade and confirm usage totals recalculate.

## Final protection
- Approve a trade and confirm the player's team, roster, depth chart, cap table, and draft-pick ownership remain unchanged until a later Madden import.
