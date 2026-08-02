# Franchise HQ v5.7.0d Validation

## 1. Version and startup

Confirm the footer reads `v5.7.0d · Multi-Team Active Trade & Fairness Hotfix` and there are no immediate console errors.

## 2. Active tab listing

Submit a valid three-team trade, return to Trade Center, and open Active.

Expected:
- The transaction appears as one card.
- Every participating team is represented.
- Status and acceptance count are visible.
- Clicking the card opens the transaction.

Repeat as another participating owner. The same transaction should appear.

## 3. Incoming tab

Switch to a participating owner who has not accepted.

Expected:
- The trade appears under Incoming.
- After that owner accepts, it no longer appears as pending for that owner.

## 4. Private participant chat

Open the multi-team transaction and send a message.

Expected:
- The message appears immediately.
- It remains after refresh.
- Every participating owner can read it.
- An unrelated owner cannot open the trade.

## 5. Modify trade

As the creator, click Modify Trade.

Expected:
- All teams, assets, recipients, and the message are restored in the unified builder.
- Make a change and submit.
- The same transaction ID is retained.
- Acceptance resets so every participant must accept the revised package again.
- A system message records the revision.

## 6. Withdraw trade

As the creator, click Withdraw Trade.

Expected:
- Status changes to Withdrawn.
- The transaction leaves Active and appears in History.
- The private chat remains preserved.
- No roster or draft-pick ownership changes occur.

## 7. Fair Trade Calculator

Open a multi-team transaction.

Expected for every participating franchise:
- Sends value
- Receives value
- Team balance percentage
- Overall balance badge
- Expandable asset valuation breakdown

Click a player in the breakdown. The full player valuation card should open.

Click a draft pick. The full draft-pick valuation card should open.

## 8. Roster protection

Record a selected player's current `teamId`, submit and approve a test trade, then check the player again.

Expected:
- The player's team remains unchanged.
- Team roster, depth chart, and cap pages remain unchanged.
- A later Madden Companion import remains the only source that can change visible ownership.

## 9. Regression

Confirm two-team trades still support chat, revise, withdraw, accept/counter/decline, committee review, and the existing Fair Trade Calculator.
