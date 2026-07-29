# Franchise HQ 4.21.4 — Trade Center Consistency Hotfix

This patch standardizes the Trade Center into one persistent shell and corrects the blank AI Suggestions view.

## Included fixes

- All Trade Center tabs now share the same page heading and tab navigation.
- History renders inside the Trade Center shell instead of as a separate standalone page.
- AI Suggestions always renders a visible result, permission message, franchise-assignment message, or empty state.
- AI suggestion generation is guarded so a data error cannot leave the page blank.
- Refreshing Active, Incoming, Committee, AI Suggestions, or History preserves the selected tab.
- Existing 4.21.1 through 4.21.3 behavior remains in place.

## Files

- `trade-module.js`
- `index.html`
- `platform/core.js`
- `VERSION-4.21.4.md`
- `VALIDATION-4.21.4.md`
