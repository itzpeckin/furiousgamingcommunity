# Support content

The public support center lives at `/support/` and does not require a league login. The landing-page footer and league sidebar link to it.

## Updating the guide

- Edit `support/index.html` for guide text and `support/support.css` for appearance.
- Keep section anchors stable so existing links continue to work.
- Add future help topics to the support navigation as they are published.
- Update the reviewed date and bot version after checking the corresponding deployed command definitions and trade behavior.
- Preview the page at desktop and mobile widths and check its section links before publishing.

The introductory Discord post is in `docs/discord-launch-post.md`. It is a draft for the league owner to post; this change does not send a Discord message.

## Initial content review

Source: the owner's 2027 season launch announcement, checked against production commit `bc7183ba82bead3cc529d3bf87005282be5ff1fd` (bot release 7.5.6.4).

Clarifications: `/trade multi-team` opens the three/four-team web composer; archived trade threads are locked rather than deleted; Counter Offer and Revise Trade open the website; `/eliminated` lists teams; playoff results show ten teams per conference; Madden execution remains the owners' responsibility. The date-specific statement about manually updated picks is replaced with durable advice to report missing picks.

This is a documentation-only addition to the 7.5.6.4 application. It changes public support assets and two navigation links; it does not change bot commands, application behavior, configuration, or data. Rollback consists of reverting this support change and redeploying the previous accepted commit.

Validation: all 243 automated tests and the strict quality gate passed. Browser checks at 1280px and 390px verified responsive columns and no horizontal page overflow. Section anchors resolved and the troubleshooting disclosure opened successfully. The Discord draft is under 2,000 characters, including its guide link.

Publishing follows the owner's request to place the support document directly on franchisehq.app. The existing isolated preview uses staging storage. Production rollback baseline: commit `bc7183ba82bead3cc529d3bf87005282be5ff1fd`, deployment `a0547f20-62bc-4ca0-bfc4-6dcac3f1d581`. Stop publication if the quality gate or preview fails, the baseline changes unexpectedly, or non-documentation changes appear in the pull request.
