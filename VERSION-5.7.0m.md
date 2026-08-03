# Franchise HQ v5.7.0m

## AI Suggestions Runtime Hotfix

This hotfix restores the missing `teamPositionProfile()` helper used by the Trade Center AI Suggestions generator.

### Fixed

- AI Suggestions no longer throws `ReferenceError: teamPositionProfile is not defined`.
- The helper builds a position profile for the signed-in team from the current player dataset.
- Positions are ranked by the best available overall rating, with average rating and position name used as stable tie-breakers.
- Positions with no assigned player are treated as the highest roster need.

### Unchanged

- Trade values
- Suggestion package calculations
- Committee workflows
- Trade limits
- Rosters and Madden-authoritative data
