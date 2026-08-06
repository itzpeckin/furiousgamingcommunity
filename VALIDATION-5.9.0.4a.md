# Validation — v5.9.0.4a

1. Upload every file from this package and replace the matching GitHub files.
2. Hard-refresh with `Ctrl + Shift + R`.
3. Confirm the footer shows `v5.9.0.4a · Import History & Events`.
4. Confirm there are no console errors on page load.
5. Run:

```javascript
FranchiseHQ.leagueImportHistory.clear()
```

6. Run:

```javascript
FranchiseHQ.leagueImportHistory.simulate({ season: 2027, week: 4 })
```

Expected: a successful history record is returned without an event-name error.

7. Run:

```javascript
FranchiseHQ.leagueImportHistory.diagnostics()
```

Expected: `version: "5.9.0.4a"` and `recordCount: 1`.

8. Run:

```javascript
FranchiseHQ.leagueDataEvents.diagnostics()
```

Expected:

- `eventName: "league:dataUpdated"`
- `internalEventName: "league:data-updated"`
- `browserCompatibilityEvent: "franchisehq:league:dataUpdated"`

9. Test the service subscription:

```javascript
const stop = FranchiseHQ.leagueDataEvents.subscribeToLeagueDataUpdated(
  event => console.log("League data event received:", event)
)

FranchiseHQ.leagueDataEvents.publishLeagueDataUpdated({
  reason: "validation-test",
  source: "development",
  season: 2027,
  week: 4,
  simulated: true
})

stop()
```

Expected: one payload is logged and no event-contract error occurs.

10. Refresh the browser and confirm the Import History record remains available.
