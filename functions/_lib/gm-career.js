const text = value => value === null || value === undefined ? '' : String(value).trim();

export function canonicalOwnershipStage(value = '', week = null) {
  const stage = text(value).toLowerCase().replaceAll('_','-').replace(/\s+/g,'-');
  if (stage.includes('pre')) return 'preseason';
  if (stage.includes('play') || stage.includes('post') || stage.includes('wild') || stage.includes('divisional') || stage.includes('champ') || stage.includes('super')) return 'playoffs';
  if (stage.includes('pro')) return 'pro-bowl';
  // Madden can retain postseason schedule rows under its regular-season route
  // and stage index. Its canonical schedule week remains authoritative: the
  // NFL regular-season schedule ends at Week 18 and postseason games begin at
  // Week 19. Keep this correction local to ownership history so normal route
  // authority elsewhere in the importer is unchanged.
  const numericWeek = Number(week);
  if (Number.isFinite(numericWeek) && numericWeek > 18) return 'playoffs';
  return 'regular-season';
}

export function ownershipScopeOrdinal(stage, week) {
  const normalized = canonicalOwnershipStage(stage,week);
  const base = normalized === 'preseason' ? 0 : normalized === 'regular-season' ? 1000 : normalized === 'playoffs' ? 2000 : 3000;
  const numeric = Number(week);
  const value = normalized === 'playoffs' && numeric >= 1 && numeric <= 4 ? numeric + 18 : numeric;
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
    gameCount:0, pointsFor:0, pointsAgainst:0, scoredGames:0,
    giveaways:0, takeaways:0, giveawayGames:0, takeawayGames:0
  };
}

function completed(game = {}) {
  const status = text(game.status).toLowerCase();
  if (game.homeScore == null || game.awayScore == null || game.homeScore === '' || game.awayScore === '') return false;
  const home = Number(game.homeScore), away = Number(game.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away)) return false;
  return ['final','completed','complete','played'].includes(status)
    || (Number.isFinite(home) && Number.isFinite(away) && (home !== 0 || away !== 0));
}

const gameTeamKey=(game,side)=>text(game[`${side}TeamKey`] ?? game[`${side}_team_key`] ?? game[`${side}TeamId`]);

function bracketAdvancedSide(game,games=[]){
  const week=ownershipScopeOrdinal(game.stage,game.week ?? game.weekIndex),home=gameTeamKey(game,'home'),away=gameTeamKey(game,'away');
  if(!Number.isFinite(week)||!home||!away)return null;
  const laterTeams=new Set();
  for(const later of games){
    const laterWeek=Number(later.week ?? later.weekIndex);
    if(canonicalOwnershipStage(later.stage,laterWeek)!=='playoffs'||!Number.isFinite(laterWeek)||ownershipScopeOrdinal(later.stage,laterWeek)<=week)continue;
    laterTeams.add(gameTeamKey(later,'home'));laterTeams.add(gameTeamKey(later,'away'));
  }
  const homeAdvanced=laterTeams.has(home),awayAdvanced=laterTeams.has(away);
  return homeAdvanced===awayAdvanced?null:homeAdvanced?'home':'away';
}

export function buildGmSeasonSummaries({games = [], periods = [], franchiseSeasonId = ''} = {}) {
  const relevantPeriods = periods.filter(period => text(period.franchiseSeasonId ?? period.franchise_season_id) === text(franchiseSeasonId));
  const summaries = new Map();
  const attributedGames = [];
  const playoffGames = games.filter(game => canonicalOwnershipStage(game.stage,game.week ?? game.weekIndex) === 'playoffs');
  // A partially imported bracket is not a championship. Legacy exports use
  // overall Week 23; current exports use Week 22 (or postseason round 4).
  const legacyFinal = playoffGames.some(game => Number(game.week ?? game.weekIndex) === 23);
  const isChampionship = game => {
    const week = Number(game.week ?? game.weekIndex);
    return /super.?bowl/i.test(text(game.stage)) || week === 23 || (!legacyFinal && week === 22) || week === 4;
  };

  const periodFor = (teamKey, game) => relevantPeriods
    .filter(period => text(period.teamKey ?? period.team_key).toLowerCase() === text(teamKey).toLowerCase() && periodOwnsGame(period,{...game,franchiseSeasonId}))
    .sort((a,b) => ownershipScopeOrdinal(b.startedStage ?? b.started_stage,b.startedWeek ?? b.started_week)-ownershipScopeOrdinal(a.startedStage ?? a.started_stage,a.startedWeek ?? a.started_week))[0] || null;

  for (const game of games) {
    const stage = canonicalOwnershipStage(game.stage,game.week ?? game.weekIndex);
    if (stage === 'preseason' || stage === 'pro-bowl') continue;
    const scoreCompleted=completed(game);
    const advancedSide=!scoreCompleted&&stage==='playoffs'?bracketAdvancedSide(game,games):null;
    for (const side of ['home','away']) {
      const teamKey = gameTeamKey(game,side);
      const period = periodFor(teamKey, game);
      if (!period) continue;
      const gmIdentityId = text(period.gmIdentityId ?? period.gm_identity_id);
      if (!gmIdentityId) continue;
      const summary = summaries.get(gmIdentityId) || emptySummary(gmIdentityId, franchiseSeasonId);
      if (!summary.teams.includes(teamKey)) summary.teams.push(teamKey);
      if (stage === 'playoffs') summary.playoffAppearance = 1;
      if (stage === 'playoffs' && isChampionship(game)) {
        summary.conferenceChampionships = 1;
        summary.superBowlAppearances = 1;
      }
      summaries.set(gmIdentityId, summary);
      if (!scoreCompleted&&!advancedSide) continue;
      const ownScore = Number(game[`${side}Score`] ?? game[`${side}_score`]);
      const other = side === 'home' ? 'away' : 'home';
      const otherScore = Number(game[`${other}Score`] ?? game[`${other}_score`]);
      const prefix = stage === 'playoffs' ? 'playoff' : 'regular';
      const result=advancedSide?(side===advancedSide?'win':'loss'):ownScore>otherScore?'win':ownScore<otherScore?'loss':'tie';
      summary[`${prefix}${result==='win'?'Wins':result==='loss'?'Losses':'Ties'}`]++;
      summary.gameCount++;
      if (scoreCompleted) {
        summary.pointsFor += ownScore; summary.pointsAgainst += otherScore; summary.scoredGames++;
        for (const [metric,count] of [['giveaways','giveawayGames'],['takeaways','takeawayGames']]) {
          const value = game[`${side}Turnovers`]?.[metric];
          if (value !== null && value !== undefined && Number.isFinite(value)) { summary[metric] += value; summary[count]++; }
        }
      }
      if (scoreCompleted&&stage === 'playoffs' && isChampionship(game)) {
        if (ownScore > otherScore) summary.superBowlChampionships = 1;
      }
      summaries.set(gmIdentityId, summary);
      attributedGames.push({
        gameId:text(game.id ?? game.externalId), gmIdentityId, teamKey, side,
        stage, week:Number(game.week ?? game.weekIndex),
        result,resultProof:advancedSide?'bracket-advancement':'completed-score'
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
    superBowlAppearances:0,superBowlChampionships:0,gameCount:0,
    pointsFor:0,pointsAgainst:0,scoredGames:0,giveaways:0,takeaways:0,giveawayGames:0,takeawayGames:0
  };
  for (const season of seasonSummaries) {
    for (const team of season.teams || []) if (!totals.teams.includes(team)) totals.teams.push(team);
    for (const key of ['regularWins','regularLosses','regularTies','playoffWins','playoffLosses','playoffTies','conferenceChampionships','superBowlAppearances','superBowlChampionships','gameCount']) totals[key] += Number(season[key] || 0);
    totals.playoffAppearances += Number(season.playoffAppearance || 0);
    for (const key of ['pointsFor','pointsAgainst','scoredGames','giveaways','takeaways','giveawayGames','takeawayGames']) totals[key] += Number(season[key] || 0);
  }
  totals.teams.sort();
  totals.wins = totals.regularWins + totals.playoffWins;
  totals.losses = totals.regularLosses + totals.playoffLosses;
  totals.ties = totals.regularTies + totals.playoffTies;
  totals.gameCount = totals.wins + totals.losses + totals.ties;
  totals.winPercentage = totals.gameCount ? (totals.wins + totals.ties / 2) / totals.gameCount : null;
  return totals;
}
