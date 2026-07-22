# Franchise HQ — TC-005.2 Negotiation Foundation Hotfix 1

This build fixes the withdrawal lookup failure by making the negotiation detail page retain its active negotiation ID and by resolving withdrawals from three independent sources:

1. The Withdraw button's stable negotiation ID.
2. The negotiation currently loaded in the detail view.
3. The Trade Center route in the browser URL.

The resolver also supports migrated legacy IDs and version IDs. Withdrawal still requires the logged-in franchise to own the current proposal version.

## Replace these files

- index.html
- styles.css
- app.js
- trade-module.js
- dev-mode.js
- README.md

After deployment, hard-refresh the browser once and reopen the negotiation from Trade Center.
