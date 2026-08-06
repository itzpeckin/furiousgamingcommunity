# Validation — v5.9.1.4 Madden Companion Export Receiver

## 1. Upload
Upload all files in this package, preserving folders. The `/functions` folder must be at the repository root so Cloudflare Pages deploys the API route.

## 2. Configure Cloudflare Pages bindings
In Cloudflare Pages → your project → Settings → Bindings:

1. Create or bind an R2 bucket as `COMPANION_EXPORTS`.
2. Create or bind a KV namespace as `COMPANION_EXPORT_META`.
3. Add an encrypted secret named `COMPANION_EXPORT_TOKEN` with a long random value.
4. Redeploy the project after saving bindings.

The optional `LEAGUE_CONFIG` KV binding is not required for the first league.

## 3. UI checkpoint
Open Commissioner HQ → League Data. Confirm the new Madden Companion Export Receiver card appears and the footer reads `v5.9.1.4 · Companion Export Receiver`.

Click **Check Receiver**. Once bindings are configured, the card should report:

- Storage: Configured
- Export Token: Configured
- Pending Export: None
- Receiver Ready

## 4. Browser diagnostics
Run:

```javascript
FranchiseHQ.leagueCompanionExportReceiver.diagnostics()
```

Confirm:

- `version` is `5.9.1.4`
- `leagueId` is `lg_fgc_001`
- `endpoint` is `/api/leagues/furious-gaming-community/companion/export`
- `automaticActivation` is `false`
- `rawPayloadPrivate` is `true`

## 5. Endpoint smoke test
Replace `YOUR_TOKEN` with the Cloudflare secret value and run from a terminal:

```bash
curl -i -X POST "https://YOUR-PAGES-DOMAIN/api/leagues/furious-gaming-community/companion/export?token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"season":2027,"week":4,"teams":[{"id":"1","name":"Test Team"}],"players":[]}'
```

Expected response: HTTP `202` with `accepted: true` and a pending export ID.

Return to Commissioner HQ and click **Check Receiver**. Confirm the card displays **New Export Available**.

## 6. Safety validation
Confirm that receiving the export does not change the active snapshot, teams, rosters, standings, statistics, or trade data.
