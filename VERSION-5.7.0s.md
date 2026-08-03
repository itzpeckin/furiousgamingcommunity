# Franchise HQ v5.7.0s

## Trade Builder Launch & AI Trade Availability Hotfix

- Restores the missing `builderActionButtons` renderer that caused Create a New Trade and Build This Trade to open a blank page.
- Keeps Clear Trade, Save Trade Offer, and Send Trade Offer available at the top and bottom of the builder.
- Disables Build This Trade when either the viewing franchise or suggested partner has no trades remaining.
- Blocks stale clicks in JavaScript even if an older page still contains an enabled button.
- Shows a prominent No Suggestions Available state when the viewing franchise is out of trades.
