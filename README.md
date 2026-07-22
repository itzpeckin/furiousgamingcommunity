# Franchise HQ — TC-005.2 Negotiation Foundation

This build replaces the trade-as-version workflow with a stable negotiation model.

## Foundation changes

- Every negotiation has one permanent `negotiationId`.
- Every offer and counteroffer is stored as an immutable child version with its own `versionId`.
- Counteroffers append a version to the existing negotiation instead of creating or locating a separate trade record.
- The active version owns the action state:
  - current proposer: Revise / Withdraw
  - receiving owner: Accept / Counter / Decline
- Commissioner identity is normalized to the commissioner-owned franchise for owner actions.
- Withdraw now resolves the permanent negotiation ID directly from the button and closes that negotiation.
- Existing TC-005.1 data is migrated automatically from the legacy local-storage structure on first load.
- Green `NEW` tags and per-side removed-asset notes remain included.

## Replace these files

- index.html
- styles.css
- app.js
- trade-module.js
- dev-mode.js
- README.md

## Recommended test

1. Deploy the six files and hard refresh once.
2. Open Trade #104 as Green Bay. Green Bay owns Version 2 and should see Revise / Withdraw.
3. Withdraw it and confirm the negotiation moves to History with status Withdrawn.
4. Reset demo data from Commissioner HQ.
5. Open Trade #104 as Dallas and submit a counter.
6. Switch to Green Bay and verify the new version is under the same Trade #104.
7. Confirm newly added assets show a green NEW tag and removed assets are listed below the correct team side.

Suggested commit message:

`Build TC-005.2 negotiation foundation`
