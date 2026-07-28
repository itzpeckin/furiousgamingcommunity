# Franchise HQ Version 4.10.1

## Navigation state hotfix

This patch preserves the My Team route during refresh, restores the saved desktop sidebar scroll position, and corrects the mobile navigation drawer lifecycle.

### Fixes

- My Team remains on My Team after a browser refresh while the simulated identity restores.
- The left navigation restores its saved scroll position after refresh.
- Selecting a destination from the mobile navigation automatically closes the drawer.
- Route changes, browser history navigation, and initial page rendering return the mobile drawer to its closed state.
- Closing the drawer clears every related state class, hides the overlay, and restores body scrolling.

## Commit message

`Version 4.10.1 - Fix refresh and mobile navigation state`
