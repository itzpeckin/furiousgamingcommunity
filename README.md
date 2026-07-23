# Franchise HQ — TC-011.4 Commissioner Operations

Built from the accepted TC-011.3.1 baseline.

Preserved:
- Developer Mode and user switching
- Trade Center
- Unified contextual player cards
- Commissioner-only navigation

Added:
- Weekly operations checklist
- Generate Recaps, Rankings, News, and Discord operation controls
- Commissioner activity log
- Persistent franchise import state
- Import validation report
- Non-blocking warnings and blocking conflicts
- Publish-and-advance confirmation
- Week advancement
- Import history

Prototype file testing:
- Normal filename passes.
- Filename containing `warning` or `partial` creates a non-blocking warning.
- Filename containing `invalid` or `broken` creates a blocking validation failure.

Replace all six files together.

Suggested commit:
`Apply TC-011.4 Commissioner Operations`
