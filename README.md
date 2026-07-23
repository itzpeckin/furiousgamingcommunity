# Franchise HQ — TC-011.3 Commissioner HQ

This build starts from the user-provided TC-011.2 files and preserves the existing Developer Mode and Trade Center.

## Verified baseline functionality

- Top-right profile menu remains active.
- Developer Mode can switch between Commissioner, owners, and Trade Committee accounts.
- Account changes continue to update role-based navigation and persist after refresh.
- Trade Center remains connected to the accepted trade module, including seeded negotiations, account permissions, committee review, history, Trade Block, and notifications.

## TC-011.3 Commissioner HQ

Commissioner HQ is now:

- The first item in the left navigation.
- Visible only to the Commissioner account.
- Protected from owner and committee accounts.
- Available from the profile menu and Developer Mode quick routes.

### Overview

- Season and week status.
- League health.
- Assigned-franchise count.
- Trade committee and commissioner queues.
- Quick access to commissioner workflows.

### Import Franchise

Prototype workflow:

1. Export Madden.
2. Upload JSON, CSV, or ZIP.
3. Validate teams, players, schedule, standings, and statistics.
4. Publish and advance Franchise HQ.

### Teams & Owners

- Displays all 32 franchises.
- Search by team or owner.
- User/CPU control selector.
- Owner-editing placeholder for future authenticated assignments.

### League Rules

- Madden-imported rule summary.
- Franchise HQ-specific rule controls.
- Existing draft-pick projection administration remains available.

Replace all six files together.

Suggested commit:

`Apply TC-011.3 Commissioner HQ`
