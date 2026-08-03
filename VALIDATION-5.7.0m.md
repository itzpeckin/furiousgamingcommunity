# Franchise HQ v5.7.0m Validation

1. Deploy `index.html` and `trade-module.js`.
2. Hard refresh the site.
3. Confirm the footer reads `v5.7.0m · AI Suggestions Runtime Hotfix`.
4. Open Developer Tools and clear the console.
5. Open `Trade Center → AI Suggestions`.
6. Confirm suggestion cards render or a valid empty-state message appears.
7. Confirm the console does not show `teamPositionProfile is not defined`.
8. Run `typeof FGC_TRADE` and confirm the Trade Center remains registered.
9. Switch among at least two team-owner identities and reopen AI Suggestions.
10. Confirm no red JavaScript application errors appear.
