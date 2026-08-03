# Franchise HQ v5.7.0t — Focused Validation

1. Confirm the footer displays `v5.7.0t` and clear the browser console.
2. Open `Trade Center → Create a New Trade`.
3. Add a second franchise.
4. Click the **+** beside a player from each team.
   - Both players must appear in the Trade Draft.
   - No console error should appear.
5. Switch one asset to Picks and click the **+** beside a draft pick.
   - The pick must appear in the Trade Draft.
6. Assign destinations so every team sends and receives at least one item.
7. Confirm the action buttons appear exactly once at the top and once at the bottom:
   - Clear Trade
   - Save Trade Offer
   - Send Trade Offer
8. Click **Send Trade Offer**.
   - The trade must submit and open its trade detail.
   - The trade must appear in Sent for the proposer and Received for the recipient.
9. Create another trade and click **Save Trade Offer**.
   - The draft must appear under Drafts.
10. Confirm no duplicate Clear Trade button appears at the bottom.
11. Final console expectation: no red JavaScript application errors.
