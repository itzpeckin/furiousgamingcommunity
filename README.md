# Franchise HQ — TC-008 Trade Block + History/Review Enhancements

## Included

- Trade Block listings for players and draft picks.
- Owners can publish a desired return for every listing.
- Other owners can ask a private question or start a proposal directly from a listing.
- Withdrawn, declined, rejected, and expired negotiations are visible only to the two involved franchises. Commissioner and committee roles do not override that privacy.
- Commissioners are now eligible reviewers alongside Trade Committee members.
- Any reviewer whose franchise is involved is automatically recused and fully locked out of voting.
- Approval still requires three approvals; rejection still requires three rejections.
- Approved trades publicly show reviewer names, roles, decisions, recusals, and comments.
- Approved trades include a Trade Replay showing every immutable version, added assets, removed assets, proposer, note, and final result.

## Deployment

Replace these six files in the existing GitHub repository:

- `index.html`
- `styles.css`
- `app.js`
- `trade-module.js`
- `dev-mode.js`
- `README.md`

Cloudflare will deploy automatically after the commit.

Suggested commit message:

`Build TC-008 trade block, commissioner review, privacy, and replay`

## Suggested acceptance test

1. Open an approved trade and confirm reviewer names, votes, comments, and recusals are visible.
2. Open Trade Replay and step through every version.
3. Switch to a commissioner and confirm an uninvolved commissioner can vote.
4. Open a trade involving Dallas as the commissioner and confirm the review panel is grayed out and locked.
5. Withdraw or decline a trade, then switch to an uninvolved commissioner or committee member and confirm it is absent from History.
6. List a player and a pick on the Trade Block, add desired-return notes, ask a question, and launch a proposal.
