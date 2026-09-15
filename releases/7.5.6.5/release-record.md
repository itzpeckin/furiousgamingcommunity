# FranchiseHQ 7.5.6.5

## Scope

Add the reusable commissioner-facing **Import Yearly Schedule** workflow. It collects Regular Season Weeks 1–18 through the existing permanent Madden export URL, validates all 272 unique games, and seals one immutable season schedule revision without changing the active week or invoking Discord.

Normal **Import Latest Export** is disabled in the browser and rejected by the server while collection is open. Finishing clears only the normal latest-export selection so the next current-week capture starts a fresh weekly source. A later normal import composes the yearly catalog beneath retained results and the newest current-week schedule, preserving stable Confidence Pool game identity.

## Added during delivery

Additive migration 42 introduces tenant- and franchise-season-scoped collection/revision rows plus retained capture links. Ordinary nonzero schedule routes remain authoritative, non-empty `/week/reg/0/` routes use payload periods, empty Week 0 remains a placeholder, and preseason/postseason routes do not enter the regular-season catalog. Commissioner UI states show progress, readiness, completion, and the exact 18-week/272-game gate.

## Known inherited blockers

Madden Companion's All Weeks control can emit only one current schedule period. Commissioners may therefore need to send the 18 Regular Season weeks individually during **Import Yearly Schedule**. FranchiseHQ cannot manufacture schedule rows that Madden did not provide. Blocked Free Agents remain unknown/null and are unrelated to this workflow.

## Validation evidence

Focused coverage validates ordinary/sentinel route authority, empty Week 0 handling, full and incomplete coverage, weekly-import interlock, immutable completion, raw-capture/audit retention, zero collection-time snapshots or Discord threads, unchanged URL token version, weekly overlay precedence, Confidence Pool identity stability, migration preservation, and foreign-key integrity. The complete repository suite passes 259/259 and the consolidated strict gate passes 247/247.

## Deployment status

The owner authorized one cycle through branch publication, protected pull request, hosted checks, Main merge, additive Production migration 42, Production deployment, and read-only acceptance. None of those release actions starts or finishes a yearly schedule collection, sends a Madden export, runs Import Latest Export, activates a snapshot, creates Discord threads, resets/deletes data, rotates the permanent URL, or archives/transitions a season.

## Rollback

The exact rollback baseline is Main `18d239bcd4cf15ab0da25d3340fd2ad071716c5c`. Runtime rollback must retain migration 42, every yearly schedule collection/revision, capture link, source capture/R2 object, audit, snapshot, and the current active pointer. Do not drop the additive tables or modify a completed immutable revision. Restore a compatible runtime before continuing an open collection.
