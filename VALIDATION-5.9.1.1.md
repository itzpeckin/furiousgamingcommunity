# Validation — Franchise HQ v5.9.1.1

1. Upload every file in the ZIP to the matching GitHub path.
2. Hard-refresh with Ctrl + Shift + R.
3. Confirm the footer shows `v5.9.1.1 · Companion JSON Mapper`.
4. Open Commissioner HQ → League Data.
5. Confirm the `Companion JSON Payload Mapper` card appears.
6. Click `Load Sample Payload`.
7. Confirm the preview reports Contract 1.0, Season 2027, Week 4, 2 teams, 2 players, and Activation `Not performed`.
8. Confirm the active snapshot shown in the Import Framework card does not change.
9. Clear the preview and confirm active league data remains unchanged.

## Console checks

```javascript
FranchiseHQ.leagueCompanionJsonMapper.diagnostics()
```

Expected: version `5.9.1.1`, `previewOnly: true`, and `snapshotActivation: false`.

```javascript
await FranchiseHQ.leagueCompanionJsonMapper.preview(
  FranchiseHQ.leagueCompanionJsonMapper.samplePayload()
)
```

Expected: `validation.valid === true`, 2 mapped teams, and 2 mapped players.

```javascript
FranchiseHQ.leagueSnapshotManager.getActiveSnapshot()?.id
```

Record the value before and after previewing. It must remain unchanged.
