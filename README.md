# Franchise HQ — TC-010.1 League Activity Feed Fix

This build fixes the blank League Home / League Activity page.

Cause corrected:
- The activity snapshot referenced a nonexistent trade-version helper, which stopped the home page render when seeded approved trades were loaded.

Included:
- Working TC-010 League Activity Feed
- Final opaque TC-009 Trade Block drawer styling
- Existing Trade Center and Team Page behavior preserved

Replace all six files together.

Suggested commit:
`Fix TC-010 League Activity Feed rendering`
