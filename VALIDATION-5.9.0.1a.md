# Validation — Franchise HQ v5.9.0.1a

## Expected visible change
The bottom-left footer must display:

`v5.9.0.1a · Import Core & State`

No new Commissioner HQ panel is expected in this release. That UI is scheduled for v5.9.0.5.

## Browser validation
1. Upload every file in this package to the matching repository path.
2. Hard refresh the deployed site with `Ctrl+Shift+R`.
3. Confirm the footer displays `v5.9.0.1a · Import Core & State`.
4. Open Developer Tools → Console.
5. Run:

```js
FranchiseHQ.metadata
```

Expected `version`: `5.9.0.1` and build `madden-companion-import-core-state`.

6. Run:

```js
FranchiseHQ.leagueImportState.diagnostics()
```

Expected:
- `service: "leagueImportState"`
- `version: "5.9.0.1"`
- `status: "idle"`
- `transitionGuard: true`

7. Run:

```js
FranchiseHQ.leagueImportService.getImportStatus()
```

Expected status: `idle`.

8. Run a successful lifecycle simulation:

```js
await FranchiseHQ.leagueImportService.simulate({ delay: 500 })
```

Expected final status: `completed`.

9. Reset the lifecycle:

```js
FranchiseHQ.leagueImportService.resetImportStatus()
```

Expected status: `idle`.

10. Run a failed lifecycle simulation:

```js
await FranchiseHQ.leagueImportService.simulate({ delay: 500, fail: true })
```

Expected final status: `failed`, with a simulated validation error.

11. Reset again:

```js
FranchiseHQ.leagueImportService.resetImportStatus()
```

12. Navigate through Home, Teams, Rosters, Schedule, Standings, Stats, Trades, and Commissioner HQ. Confirm no layout or behavior regressions and no console errors.

## Pass criteria
- Correct footer version appears.
- Both import services exist.
- Successful simulation reaches `completed`.
- Failed simulation reaches `failed`.
- Reset returns the state to `idle`.
- Existing pages remain unchanged.
