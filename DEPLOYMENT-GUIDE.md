# TC-012 Cloudflare Deployment Guide

This package was built directly from the accepted TC-011.5 ZIP supplied for this sprint.

## Files to upload to GitHub

Replace these six existing files:

- `index.html`
- `styles.css`
- `app.js`
- `trade-module.js`
- `dev-mode.js`
- `README.md`

Add these new files and folders:

- `_routes.json`
- `wrangler.jsonc`
- `DEPLOYMENT-GUIDE.md`
- `functions/api/discord/_shared.js`
- `functions/api/discord/status.js`
- `functions/api/discord/channels.js`
- `functions/api/discord/connect.js`
- `functions/api/discord/test.js`
- `functions/api/discord/disconnect.js`
- `migrations/0001_discord_connections.sql`

Do not upload the ZIP itself into the repository. Upload the contents while preserving the folder structure.

# Part 1 — Back up the working release

1. Open the Franchise HQ GitHub repository.
2. Download the current repository as a ZIP or create a release/tag named `TC-011.5-accepted`.
3. Do not delete the current Cloudflare deployment. Cloudflare keeps deployment history, which gives you another rollback point.

# Part 2 — Upload TC-012

1. Open the repository's main file list.
2. Click **Add file** → **Upload files**.
3. Drag every file and folder listed above into the upload area.
4. Confirm that GitHub shows paths beginning with `functions/api/discord/` and `migrations/`.
5. Commit with: `Apply TC-012 Cloudflare Discord and Permissions`.
6. Wait for the Cloudflare Pages deployment to finish.

At this stage the website should load, but the Discord page will report that Cloudflare bindings or secrets are missing. That is expected.

# Part 3 — Create D1

1. Open Cloudflare.
2. Open **Storage & Databases** → **D1 SQL Database**.
3. Click **Create database**.
4. Name it `franchise-hq`.
5. Open the new database.
6. Open **Console**.
7. Open `migrations/0001_discord_connections.sql` from this package.
8. Copy all SQL from that file.
9. Paste it into the D1 console.
10. Click **Execute**.
11. Confirm the `discord_connections` table appears.

# Part 4 — Bind D1 to the Pages project

1. Open **Workers & Pages**.
2. Open the existing Franchise HQ Pages project.
3. Open **Settings** → **Bindings**.
4. Click **Add binding**.
5. Choose **D1 database**.
6. Set the variable name to exactly `DB`.
7. Select the `franchise-hq` database.
8. Save.
9. Redeploy the latest Pages deployment so the binding is present.

# Part 5 — Add Cloudflare variables and secrets

Open the Franchise HQ Pages project, then **Settings** → **Variables and Secrets**. Add these to **Production**.

## Secret 1: Discord bot token

1. Add a secret named `DISCORD_BOT_TOKEN`.
2. In Discord Developer Portal, open the Franchise HQ application → **Bot**.
3. Copy or reset the token.
4. Paste it directly into Cloudflare.
5. Save.

Never put this token in GitHub, JavaScript, screenshots, or chat.

## Secret 2: Commissioner deployment key

1. Create a long random password, ideally at least 24 characters.
2. Add it as a secret named `COMMISSIONER_API_KEY`.
3. Save the same value in your password manager.

You will paste this key into Commissioner HQ only when managing Discord. Franchise HQ stores it in browser `sessionStorage`, so closing the tab removes it.

## Variable: Discord server ID

1. Add a normal variable named `DISCORD_GUILD_ID`.
2. Paste the Discord Server ID you copied.
3. Save.

You do not need to create a channel-ID variable. The selected channel is saved in D1.

# Part 6 — Redeploy

After saving the D1 binding and all three values:

1. Open **Deployments** in the Franchise HQ Pages project.
2. Redeploy the latest production deployment, or push a harmless README commit.
3. Wait for deployment to finish.
4. Open Franchise HQ in a new browser tab.

# Part 7 — Connect Discord

1. Use Developer Mode to switch to the Commissioner account.
2. Open **Commissioner HQ**.
3. Open **Discord Integration**.
4. Paste the exact `COMMISSIONER_API_KEY` value.
5. Click **Save for this tab**.
6. Click **Refresh Status**.
7. Choose `#franchise-hq-testing`.
8. Click **Save Channel**.
9. Click **Send Test Message**.
10. Open Discord and confirm the embedded Franchise HQ test post appears.

# Part 8 — Validate Trade Committee

1. Open Commissioner HQ → **Teams & Owners**.
2. Open the Role dropdown for a test identity.
3. Confirm **Trade Committee** appears.
4. Select it.
5. Refresh the browser.
6. Confirm the selection persists.
7. Use Developer Mode and choose one of the existing Trade Committee accounts.
8. Open Trade Center and confirm hidden committee reviews remain available.
9. Confirm Commissioner HQ remains hidden for Trade Committee accounts.

# Troubleshooting

- **The API says DB is missing:** The binding must be named exactly `DB`, then redeploy.
- **The API says token is missing:** Add `DISCORD_BOT_TOKEN` as a Production secret, then redeploy.
- **401 / key error:** Paste the exact value stored as `COMMISSIONER_API_KEY`.
- **No channels appear:** Confirm the bot is installed in the server and `DISCORD_GUILD_ID` is correct.
- **Test message fails:** Confirm the bot can View Channel, Send Messages, and Embed Links in the testing channel.
- **Functions return 404:** Confirm the `functions` directory is at the root of the GitHub repository, not inside another folder.
