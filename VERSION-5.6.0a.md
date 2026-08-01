# Franchise HQ v5.6.0a

## Confidence Pick Workflow Hotfix

This hotfix separates winner selection from confidence assignment in the Confidence Pool.

### Changes

- Owners may select winners for any number of games before assigning confidence values.
- Winner selection no longer silently assigns confidence `1`.
- Confidence values are saved only when the Confidence dropdown is changed.
- Duplicate-confidence validation runs only during confidence assignment.
- Auto-Assign Week now requires every game in the week to have a winner selected and assigns confidence values without changing those picks.
- The Confidence dropdown is constrained to the game-card grid and no longer extends beyond the card edge.
- Submission validation now distinguishes missing winners from missing confidence values.

No game records, scoring rules, pool-lock controls, or roster features were changed.
