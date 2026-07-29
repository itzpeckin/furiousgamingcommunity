# Version 5.2 Validation

Upload every file in the patch while preserving folder paths, then hard refresh.

## 1. Release and deployment

```javascript
FranchiseHQ.metadata.version
```

Expected: `"5.2"`

```javascript
FranchiseHQ.manifest.diagnostics()
```

Expected: `compliant: true` and no missing League Engine scripts or services.

## 2. League Engine health

```javascript
FranchiseHQ.maddenLeague.diagnostics()
```

Expected:

- `version: "5.2"`
- `authority: "madden"`
- `readOnly: true`
- `repository.guardedInstall: true`
- `compliant: true`

## 3. Valid import preview and commit

```javascript
const validImport = {
  league: { id: "league-1", name: "Validation League", season: 2026, week: 1 },
  teams: [{ id: "team-1", name: "Validation Team" }],
  players: [{ id: "player-1", firstName: "Test", lastName: "Player", teamId: "team-1" }]
};

const preview = FranchiseHQ.maddenLeague.previewImport(validImport, {
  channel: "manual-upload",
  importId: "validation-5.2-valid",
  sourceLeagueId: "league-1"
});

({ valid: preview.report.valid, errors: preview.report.errors, warnings: preview.report.warnings });
```

Expected: `valid: true`, no errors. Warnings for unavailable optional collections are expected.

```javascript
const committed = FranchiseHQ.maddenLeague.commitImport(preview);
({ installed: committed.installed, importId: FranchiseHQ.maddenLeague.get().source.importId });
```

Expected: `installed: true` and `importId: "validation-5.2-valid"`.

## 4. Failed import retains the valid snapshot

```javascript
const failed = FranchiseHQ.maddenLeague.ingest({ league: null, teams: [], players: [] }, {
  channel: "manual-upload",
  importId: "validation-5.2-invalid"
});

({
  installed: failed.installed,
  retainedImportId: failed.retainedImportId,
  currentImportId: FranchiseHQ.maddenLeague.get().source.importId,
  quarantineCount: FranchiseHQ.maddenLeague.quarantine.diagnostics().count
});
```

Expected:

- `installed: false`
- retained and current import IDs remain `validation-5.2-valid`
- quarantine count is at least 1

## 5. Direct repository mutation is rejected

```javascript
try {
  FranchiseHQ.leagueRepository.install(FranchiseHQ.maddenLeague.exportSnapshot(), { validated: true });
  'FAILED: direct installation was accepted';
} catch (error) {
  error.message;
}
```

Expected: `League snapshots require a valid import-validation receipt.`

## 6. Platform regression

```javascript
await FranchiseHQ.release.preflight()
```

Expected: `ready: true`.

Manually refresh and verify Home, My Team, Commissioner HQ, Trade Center, Trade Block, and Trade History still render normally.
