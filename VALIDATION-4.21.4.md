# Validation — 4.21.4

Upload every file while preserving the `platform/core.js` path, then hard refresh.

## Console

Confirm there are no uncaught errors, especially errors involving:

- `generateAISuggestions`
- `renderAISuggestions`
- `tradeCenterShell`
- `renderTradeHistory`

## Trade Center shell

1. Open Trade Center.
2. Click Active, Incoming, Committee, AI Suggestions, and History.
3. Confirm the `Trade Center` heading and tab bar remain in the same position on every tab.
4. Confirm only the content beneath the tabs changes.
5. Refresh each tab directly and confirm the same tab reloads.
6. Use browser Back and Forward and confirm tab navigation remains correct.

## AI Suggestions

1. Open AI Suggestions as an owner or commissioner assigned to a team.
2. Confirm the page displays suggestion cards or the `No strong matches yet` empty state.
3. Click `Refresh suggestions` and confirm the page remains visible.
4. When suggestions exist, click `Build this trade` and confirm the Trade Builder opens with the package populated.
5. Switch to a committee identity without a franchise and confirm a visible identity-required message appears instead of a blank page.

## History

1. Open History.
2. Confirm History appears beneath the shared Trade Center tabs.
3. Search and filter history.
4. Clear filters.
5. Open a history record and use Back to return to the History tab.

## Version

```javascript
FranchiseHQ.metadata.version
```

Expected:

```text
"4.21.4"
```
