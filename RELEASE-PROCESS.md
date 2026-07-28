# Franchise HQ Release Process

## 1. Prepare the patch

Every release ZIP contains only new and modified files. Preserve the included directory paths when uploading to GitHub.

## 2. Confirm deployment

Wait for the Cloudflare deployment to complete, then hard-refresh the application.

## 3. Run automated validation

```javascript
await FranchiseHQ.validate.run()
```

Required result: zero failures and a compliant report.

## 4. Run release preflight

```javascript
const preflight = await FranchiseHQ.release.preflight()
```

Required result: `preflight.ready === true`.

## 5. Run certification

```javascript
const certification = await FranchiseHQ.release.certify({ preflight })
```

Required result: `certification.certified === true`, with no failures or warnings.

## 6. Complete manual regression

Verify authentication, hard refresh, navigation, Commissioner HQ, My Team, Teams, Players, Schedule, Standings, League News, Trade Center, identity simulation, and logout.

## 7. Approve the release

A release is complete only after automated validation, preflight, certification, and manual regression all pass.

## Troubleshooting

Generate a redacted support bundle with:

```javascript
FranchiseHQ.release.downloadSupportBundle()
```
