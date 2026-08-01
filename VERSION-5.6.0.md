# Franchise HQ v5.6.0 — Season, Games & Confidence Pool Service

This release introduces the canonical Games service, league-wide schedule experience, and season-long Confidence Pool.

## Included
- Season, current-week, game lookup, team schedule, upcoming and completed game APIs
- League schedule week navigation and team filtering
- Full-season Confidence Pool entries completed before the Commissioner restricts submissions
- Weekly confidence values that reset for each week
- Draft saving, automatic weekly assignment, full-entry validation, submission, scoring, and results
- Commissioner HQ controls to open or restrict the season entry window
- Development-mode identity testing and local persistence

## Public service
`FranchiseHQ.modules.league.games`

## Confidence rules
- All regular-season picks are completed during the Commissioner-controlled season window
- No real-time kickoff lock is used
- Confidence values are unique within each week
- Correct pick earns the assigned confidence value
- Incorrect pick earns zero
- Ties earn half confidence
- Final game results automatically update scoring
