# Franchise HQ v5.6.1c Validation

## 1. Version and startup

Confirm the footer displays:

`v5.6.1c · Commissioner Controls Foundation`

Confirm no immediate red console errors appear.

## 2. Commissioner tab order

Open Commissioner HQ.

Expected order begins:

1. Overview
2. Commissioner Controls
3. Import Franchise
4. Teams & Owners
5. League Rules
6. League Data

Confirm Overview and Commissioner Controls are both clickable.

## 3. Internal tabs

Open Commissioner Controls.

Expected internal tabs:

- Trade Value
- Confidence Pool

Trade Value must be selected first by default.

## 4. Player Value Calculations

Confirm Section A displays adjustable values for Overall, Position, Development, Age, Contract, Production, Elite Premium, and Injury Risk.

Change one value, navigate away, and return.

Expected: the changed value persists.

Open a player card before and after changing a setting.

Expected: the Trade Calculator Breakdown and total value reflect the new weight.

Click Reset Player Defaults.

Expected: all player percentages return to 100%.

## 5. Draft Pick Value Calculations

Confirm Section B displays:

- Round 1–7 base values
- Future-pick retained values
- Pick 1 and Pick 32 multipliers
- All team-owner projected slots

Change a round base or future retention value and open a draft-pick card.

Expected: the draft-pick value and breakdown update.

Change a team projected slot.

Expected: the value persists and the team's pick calculation changes.

Click Reset Pick Defaults.

Expected: approved default values return.

## 6. Confidence Pool settings

Open Commissioner Controls → Confidence Pool.

Confirm the existing controls appear:

- First open week
- Last open week
- Open Selected Weeks
- Close Confidence Pool
- View Confidence Pool

Open and close a submission window.

Expected: existing v5.6.1a behavior remains unchanged.

## 7. Overview cleanup

Return to Overview.

Expected: the Confidence Pool management card is no longer duplicated there. Other Overview widgets and operations remain intact.

## 8. Regression

Confirm Trade Center calculations, player cards, pick cards, Commissioner tabs, Confidence Pool picks, Standings, and Schedule still load without red console errors.
