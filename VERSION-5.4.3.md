# Franchise HQ v5.4.3 — LD-003 Data Source Selector

## Delivered
- Added a Commissioner-only Data Source Selector inside Commissioner HQ → League Data.
- Added selectable Development Data and Empty State sources.
- Added a protected Madden Companion option that remains disabled until a verified live snapshot exists.
- Added confirmation before changing the active source.
- Persisted the selected source in browser storage and restored it after refresh.
- Preserved all stored snapshots when switching sources.

## Boundary
This release changes only the League Data State Manager's active read source. Existing Home, Teams, Players, Schedule, and Standings screens remain on the legacy prototype read path until the later read-model conversion stories.
