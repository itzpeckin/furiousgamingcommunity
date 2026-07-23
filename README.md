# Franchise HQ — TC-011.3 Commissioner HQ

Epic 2 introduces the commissioner-facing league operations workspace.

## Commissioner HQ

Four protected tabs are included:

### Overview
- Current season and week
- Last Madden franchise import
- Team assignment coverage
- League-rule status
- Primary Advance Week workflow
- Latest import validation health

### Import Franchise
- Export-based four-step workflow
- JSON, CSV, or ZIP file selection
- Prototype validation checklist
- Publish & Advance action
- Madden remains the source of truth

The action is intentionally named **Advance Week**, but it advances Franchise HQ by importing and publishing the newest Madden franchise export. It does not attempt to control Madden directly.

### Teams & Owners
- All 32 franchises
- Owner assignment status
- User/CPU control selector
- Search by team or owner
- Management action placeholders for the future authentication layer

### League Rules
- League structure
- Roster management
- Progression
- Gameplay
- Save-draft interaction placeholder

Schedule editing, force wins/losses, rescheduling, and general transaction approval were intentionally excluded.

## Player Card behavior

Player clicks now open a closeable Player Card overlay rather than navigating away from the current screen.

This preserves context from:
- Team pages
- Player database
- Game Center
- League Home
- Stats and leader pages
- Trade pages
- Command search

When a Player Card is opened over Game Center, closing it restores the Game Center instead of returning to another page.

## League Home cosmetic update

The weekly schedule ribbon now has:
- Slightly transparent container background
- Defined border
- Inner depth
- Stronger schedule-card surfaces
- Existing hover highlight

Replace all six files together.

Suggested commit:
`Build TC-011.3 Commissioner HQ and context-preserving player cards`
