# Commissioner season import runbook

Applies to FranchiseHQ 7.5.6 and later. These actions belong to your league; publishing the application does not perform them for you.

## Prepare a new franchise season

Complete the Madden season first. If you are closing a completed FranchiseHQ season, use its existing **Archive Season** control once after checking the season and confirmation. Do not archive simply to refresh a week. The archive workflow preserves history and prepares the next franchise-season identity; this release does not change that workflow or automatically run it. Keep your existing permanent export URL.

## First schedule import

Export League Info, Rosters, and All Weeks / Weekly Stats from Madden Companion to the existing league URL. In **Commish HQ → Command Center** or **League Data**, refresh the connection and select **Import Latest Export** when ready. The importer maps, builds, validates, and atomically makes the exact eligible snapshot live. A failure leaves the previous active snapshot in place.

The schedule shows every matchup Madden actually provided. FranchiseHQ cannot invent a missing future schedule. A multi-week `/week/reg/0/` schedule uses each row's zero-based payload week plus one; an ordinary nonzero route still wins over duplicate aggregate data. Empty Week 0 routes remain placeholders.

Check the captured/current period in League Data and the global header. Week 1 must stay Week 1 even if the schedule extends to Week 18. Current-state metadata is preferred; when absent, the latest captured playable statistic period supplies the fallback evidence. Conflicting metadata or an unresolved aggregate stops import readiness. Current-period schedule and statistic routes must exist; successful empty current statistic routes are allowed before games finish. Future statistic routes are not required just because future games exist.

An initial import has no previous period against which to prove advancement, so it does not automatically create scheduling threads. For an initial regular-season schedule, a commissioner may use the existing `/week1` command (or `/weekN` for the verified current regular-season week) once in the connected server. It uses the configured schedule channel and registered team owners. It does not create the rest of the season's threads.

## Confidence Pool

All imported regular-season weeks are available to the existing commissioner Confidence Pool window controls. Enable the feature and open the desired range in League Controls. Importing a full schedule does not automatically open voting or change saved selections. Weekly imports retain known future matchups and preserve their application IDs when Madden renumbers a matchup with the same season, stage, week, home team and away team.

## Refresh results in the same week

Export and import the updated Madden data normally. The live results and statistics update, but the current period stays the same. Automatic Discord synchronization does no work: no thread creation, deletion, reposting, or thread-inventory update occurs. An identical source reuses its existing import result.

## Advance one week

Advance in Madden, export the new current information/rosters/statistics, then select **Import Latest Export**. A proved Week N → N+1 transition creates only the new current week's matchup threads. A proved Preseason Week 3 → Regular Season Week 1 transition is also allowed. The importer does not advance Madden.

Discord creates/reuses all new matchups before deleting old FranchiseHQ scheduling threads. A creation failure preserves the previous threads. Unrelated server channels and threads are never targets. Database thread audit rows remain retained after Discord deletion.

## Recovery and review

If import readiness fails, read the reported source issue and captured/current period in League Data. Refresh after the appropriate current data has arrived; do not reset data, rotate the URL, or archive to repair a failed export. Blocked Madden Free Agents remain unknown, not an empty roster.

Initial imports, season changes, backward/ambiguous periods, and skipped-period anomalies do not trigger automatic thread replacement. League Data reports review/retry status for the active imported snapshot. Verify the intended current period before manually scheduling it.

If a verified regular-season advance has a failed Discord sync, check the configured channel and bot permissions, then run the existing `/weekN` command for that current week. It reuses recorded matchups and retries incomplete creation; old threads are removed only after the entire proved new week is ready. A manual command for some other week is not authority to clean up the active schedule. Do not use import again solely to retry Discord delivery. Permission repairs may require a Discord server administrator.

The runtime checks that its snapshot is still active before cleanup. If a newer import supersedes the run, remaining prior threads are preserved rather than deleted for an obsolete period. Follow the current snapshot's review status instead.
