# Franchise HQ v5.6.0a Validation

## 1. Version and startup

Confirm the footer displays `v5.6.0a · Confidence Pick Workflow Hotfix` and the console has no immediate red errors.

## 2. Card width

Open Schedule → My Season Picks. Confirm every Confidence dropdown remains fully inside its game card at normal desktop width. Narrow the browser and confirm the card stacks cleanly at mobile width.

## 3. Select winners first

Select winners for several games without touching the Confidence dropdowns. Confirm each selection remains highlighted and no duplicate-confidence warning appears.

## 4. Refresh persistence

Refresh the page. Confirm the selected winners remain saved and their Confidence dropdowns still show `Select`.

## 5. Assign confidence afterward

Assign different confidence values to the selected games. Confirm each value saves normally.

## 6. Duplicate validation timing

Try assigning a confidence number already used by another game in the same week. Confirm the warning appears only now and says that the value is already used. Confirm the original game's confidence remains unchanged.

## 7. Change a winner

Change the selected winner for a game that already has a confidence value. Confirm the new winner saves and the existing confidence remains assigned to that game.

## 8. Auto-Assign Week

On an incomplete week, click Auto-Assign Week before selecting every winner. Confirm it is blocked with a message requiring winner selections first. Select every winner and run it again. Confirm confidence values 1 through the number of games are assigned without changing any selected winners.

## 9. Submission validation

Attempt to submit with missing confidence values. Confirm submission is blocked and the entry remains a draft.

## 10. API checks

Run:

```javascript
({
  saveSelection: typeof FranchiseHQ.leagueGames.confidence.saveSelection,
  saveConfidence: typeof FranchiseHQ.leagueGames.confidence.saveConfidence,
  savePick: typeof FranchiseHQ.leagueGames.confidence.savePick
});
```

Expected: all three values are `"function"`.

## 11. Regression

Confirm Commissioner Open/Restrict controls, Pool Results, League Schedule, scoring, and existing Team pages continue to work without console errors.
