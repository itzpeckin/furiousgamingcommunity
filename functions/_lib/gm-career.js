const text = value => value === null || value === undefined ? '' : String(value).trim();

export function canonicalOwnershipStage(value = '') {
  const stage = text(value).toLowerCase().replaceAll('_','-').replace(/\s+/g,'-');
  if (stage.includes('pre')) return 'preseason';
  if (stage.includes('play') || stage.includes('post') || stage.includes('wild') || stage.includes('divisional') || stage.includes('champ') || stage.includes('super')) return 'playoffs';
  if (stage.includes('pro')) return 'pro-bowl';
  return 'regular-season';
}

export function ownershipScopeOrdinal(stage, week) {
  const normalized = canonicalOwnershipStage(stage);
  const base = normalized === 'preseason' ? 0 : normalized === 'regular-season' ? 1000 : normalized === 'playoffs' ? 2000 : 3000;
  const value = Number(week);
  return base + (Number.isFinite(value) ? Math.max(0,value) : 0);
}

export function periodOwnsGame(period = {}, game = {}) {
  if (text(period.franchiseSeasonId ?? period.franchise_season_id) !== text(game.franchiseSeasonId ?? game.franchise_season_id)) return false;
  const gameScope = ownershipScopeOrdinal(game.stage, game.week ?? game.weekIndex);
  const start = ownershipScopeOrdinal(period.startedStage ?? period.started_stage, period.startedWeek ?? period.started_week);
  const endedStage = period.endedStage ?? period.ended_stage;
  const endedWeek = period.endedWeek ?? period.ended_week;
  const end = endedStage === null || endedStage === undefined || endedStage === ''
    ? Number.POSITIVE_INFINITY
    : ownershipScopeOrdinal(endedStage, endedWeek);
  return gameScope >= start && gameScope < end;
}

function emptySummary(gmIdentityId, franchiseSeasonId) {
  return {
    gmIdentityId,
    franchiseSeasonId,
    teams:[],
    regularWins:0, regularLosses:0, regularTies:0,
    playoffWins:0, playoffLosses:0, playoffTies:0,
    playoffAppearance:0,
    conferenceChampionships:0,
    superBowlAppearances:0,
    superBowlChampionships:0,
    gameCount:0
  };
}

function completed(game = {}) {
  const status = text(game.status).toLowerCase();
  const home = Number(game.homeScore), away = Number(game.awayScore);
  return ['final','completed','complete','played'].some(value => status.includes(value))
    || (Number.isFinite(home) && Number.isFinite(away) && (home !== 0 || away !== 0));
}

export function buildGmSeasonSummaries({games = [], periods = [], franchiseSeasonId = ''} = {}) {
  const relevantPeriods = periods.filter(period => text(period.franchiseSeasonId ?? period.franchise_season_id) === text(franchiseSeasonId));
  const summaries = new Map();
  const attributedGames = [];
  const playoffGames = games.filter(game => canonicalOwnershipStage(game.stage) === 'playoffs' && completed(game));
  const championshipScope = playoffGames.length
    ? Math.max(...playoffGames.map(game => ownershipScopeOrdinal(game.stage, game.week ?? game.weekIndex)))
    : null;

  const periodFor = (teamKey, game) => relevantPeriods
    .filter(period => text(period.teamKey ?? period.team_key).toLowerCase() === text(teamKey).toLowerCase() && periodOwnsGame(period,{...game,franchiseSeasonId}))
    .sort((a,b) => ownershipScopeOrdinal(b.startedStage ?? b.started_stage,b.startedWeek ?? b.started_week)-ownershipScopeOrdinal(a.startedStage ?? a.started_stage,a.startedWeek ?? a.started_week))[0] || null;

  for (const game of games) {
    if (!completed(game) || canonicalOwnershipStage(game.stage) === 'preseason' || canonicalOwnershipStage(game.stage) === 'pro-bowl') continue;
    for (const side of ['home','away']) {
      const teamKey = text(game[`${side}TeamKey`] ?? game[`${side}_team_key`] ?? game[`${side}TeamId`]);
      const period = periodFor(teamKey, game);
      if (!period) continue;
      const gmIdentityId = text(period.gmIdentityId ?? period.gm_identity_id);
      if (!gmIdentityId) continue;
      const summary = summaries.get(gmIdentityId) || emptySummary(gmIdentityId, franchiseSeasonId);
      if (!summary.teams.includes(teamKey)) summary.teams.push(teamKey);
      const ownScore = Number(game[`${side}Score`] ?? game[`${side}_score`]);
      const other = side === 'home' ? 'away' : 'home';
      const otherScore = Number(game[`${other}Score`] ?? game[`${other}_score`]);
      const stage = canonicalOwnershipStage(game.stage);
      const prefix = stage === 'playoffs' ? 'playoff' : 'regular';
      if (ownScore > otherScore) summary[`${prefix}Wins`]++;
      else if (ownScore < otherScore) summary[`${prefix}Losses`]++;
      else summary[`${prefix}Ties`]++;
      summary.gameCount++;
      if (stage === 'playoffs') summary.playoffAppearance = 1;
      if (stage === 'playoffs' && ownershipScopeOrdinal(game.stage,game.week ?? game.weekIndex) === championshipScope) {
        summary.conferenceChampionships = 1;
        summary.superBowlAppearances = 1;
        if (ownScore > otherScore) summary.superBowlChampionships = 1;
      }
      summaries.set(gmIdentityId, summary);
      attributedGames.push({
        gameId:text(game.id ?? game.externalId), gmIdentityId, teamKey, side,
        stage, week:Number(game.week ?? game.weekIndex),
        result:ownScore > otherScore ? 'win' : ownScore < otherScore ? 'loss' : 'tie'
      });
    }
  }

  for (const summary of summaries.values()) summary.teams.sort();
  return {summaries:[...summaries.values()],attributedGames};
}

export function careerTotals(seasonSummaries = []) {
  const totals = {
    seasons:seasonSummaries.length, teams:[],
    regularWins:0,regularLosses:0,regularTies:0,
    playoffWins:0,playoffLosses:0,playoffTies:0,
    playoffAppearances:0,conferenceChampionships:0,
    superBowlAppearances:0,superBowlChampionships:0,gameCount:0
  };
  for (const season of seasonSummaries) {
    for (const team of season.teams || []) if (!totals.teams.includes(team)) totals.teams.push(team);
    for (const key of ['regularWins','regularLosses','regularTies','playoffWins','playoffLosses','playoffTies','conferenceChampionships','superBowlAppearances','superBowlChampionships','gameCount']) totals[key] += Number(season[key] || 0);
    totals.playoffAppearances += Number(season.playoffAppearance || 0);
  }
  totals.teams.sort();
  return totals;
}
