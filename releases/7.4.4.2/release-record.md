# FranchiseHQ 7.4.4.2 Release Record

## Scope

Complete the platform-wide phone and tablet composition gate before Discord commands and canonical back-end consistency. This release prioritizes readable mobile hierarchy, locally bounded data scrolling, and touch-safe controls. It specifically repairs the missing **Manage** action in Commissioner HQ → Teams & Owners and the Player Card portrait/text collision reported by the owner.

## Added during delivery

- Replaced scaled-down desktop behavior with a shared phone/tablet composition for page headings, action groups, filters, dense grids, and deliberately bounded tables.
- Reflowed Player Cards into separate portrait/overall and identity rows through the 900-pixel tablet boundary. Tabs remain reachable with local horizontal scrolling; the card owns the viewport; ratings, contract content, and game-log tables remain usable without rotating the phone.
- Overrode the legacy tablet rule that hid every Teams & Owners row button below 1,000 pixels. Every franchise now retains Owner, Role, Status, and a visible team-specific **Manage** action.
- Made the smallest-phone Manage action full width with a 46-pixel touch target. The existing server-authoritative dialog continues to expose **Save Assignment**, **Remove from Team**, and **Revoke Access** without changing membership behavior.
- Added an executable responsive acceptance fixture plus route, Player Card, and Teams & Owners regression contracts.

## Known inherited blockers

None registered. Madden Free Agents remain blocked upstream and their count remains unknown/null; this release does not reinterpret that state.

## Validation evidence

The responsive contract verifies 13 active member and commissioner surfaces, the 320-, 390-, 834-, and 1,440-pixel viewport boundaries, local table scrolling, Player Card content separation, and complete Teams & Owners touch management. The focused mobile/commissioner suite passed 9/9 tests. The consolidated repository gate and final test count are recorded in `validation-evidence.json`.

## Deployment status

Validated local review candidate only. GitHub publication, a pull request, hosted checks, Main, staging, and Production are not authorized in this cycle. No migration, import, reset, archive, transition, snapshot activation, membership change, or Production data write was performed.

## Rollback

Discard the unmerged 7.4.4.2 candidate and return to exact local baseline `abd6b8b908fe6f8988dc227464220bcaaab24dfa`. Production remains FranchiseHQ 7.4.4.1 on Pages deployment `548c8453-775c-4b0c-8aac-b03acc543004` with migration 33 and the existing protected league state unchanged.
