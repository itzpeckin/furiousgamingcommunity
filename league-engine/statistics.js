(function initStatisticsService(global){
  'use strict';
  const HQ=global.FranchiseHQ=global.FranchiseHQ||{};
  const VERSION='5.6.2';
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const freeze=(v,seen=new WeakSet())=>{if(!v||typeof v!=='object'||seen.has(v))return v;seen.add(v);Object.values(v).forEach(x=>freeze(x,seen));return Object.freeze(v)};
  const num=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;
  const text=v=>String(v??'').trim();
  const rosterService=()=>HQ.modules?.league?.rosters||HQ.leagueRosters;
  const gamesService=()=>HQ.modules?.league?.games||HQ.leagueGames;
  const standingsService=()=>HQ.modules?.league?.standings||HQ.leagueStandings;
  const appPlayers=()=>global.FGC_APP?.players||[];
  const appTeams=()=>global.FGC_APP?.teams||[];
  const teamMap=()=>new Map(appTeams().map(t=>[String(t.id),t]));
  const playerMap=()=>new Map(appPlayers().map(p=>[String(p.id),p]));
  const defensePositions=new Set(['LE','RE','DE','DT','NT','LOLB','MLB','ROLB','LB','EDGE','CB','FS','SS','S']);
  const categoryPositions={passing:['QB'],rushing:['QB','RB','FB'],receiving:['RB','FB','WR','TE'],defense:[...defensePositions],kicking:['K'],punting:['P']};
  const categorySort={passing:'passingYards',rushing:'rushingYards',receiving:'receivingYards',defense:'tackles',kicking:'points',punting:'average'};

  function rawPlayers(){
    const service=rosterService();
    const normalized=service?.searchPlayers?.('')||[];
    const byId=playerMap();
    if(normalized.length){
      return normalized.map(p=>{
        const app=byId.get(String(p.id))||{};
        return {...clone(p),stats:clone(app.stats||p.raw?.stats||p.stats||{}),teamId:p.teamId||app.teamId,overall:p.overall??app.overall,position:p.position||app.position,name:p.name||app.name};
      });
    }
    return appPlayers().map(p=>clone(p));
  }
  function normalizeStats(player){
    const s=player?.stats||{};
    const completions=num(s.completions??s.passCompletions??s.cmp);
    const attempts=num(s.attempts??s.passAttempts??s.att);
    const passingYards=num(s.passingYards??s.passYards);
    const passingTD=num(s.passingTD??s.passTD??s.passingTouchdowns);
    const interceptions=num(s.interceptions??s.passInterceptions);
    const carries=num(s.carries??s.rushAttempts);
    const rushingYards=num(s.rushingYards??s.rushYards);
    const rushingTD=num(s.rushingTD??s.rushTD??s.rushingTouchdowns);
    const receptions=num(s.receptions??s.rec);
    const targets=num(s.targets);
    const receivingYards=num(s.receivingYards??s.recYards);
    const receivingTD=num(s.receivingTD??s.recTD??s.receivingTouchdowns);
    const tackles=num(s.tackles??s.totalTackles);
    const soloTackles=num(s.soloTackles);
    const assistedTackles=num(s.assistedTackles);
    const sacks=num(s.sacks);
    const defensiveInterceptions=num(s.defensiveInterceptions??(defensePositions.has(String(player.position||'').toUpperCase())?s.interceptions:0));
    const fgm=num(s.fgm??s.fieldGoalsMade);
    const fga=num(s.fga??s.fieldGoalsAttempted);
    const xpm=num(s.xpm??s.extraPointsMade);
    const xpa=num(s.xpa??s.extraPointsAttempted);
    const punts=num(s.punts);
    const puntYards=num(s.puntYards);
    return {
      games:num(s.games??s.gamesPlayed),
      completions,attempts,compPct:attempts?Number((completions/attempts*100).toFixed(1)):num(s.compPct),
      passingYards,passingTD,interceptions,yardsPerAttempt:attempts?Number((passingYards/attempts).toFixed(1)):num(s.yardsPerAttempt),passerRating:num(s.passerRating??s.rating),sacksTaken:num(s.sacksTaken),
      carries,rushingYards,rushingTD,yardsPerCarry:carries?Number((rushingYards/carries).toFixed(1)):num(s.yardsPerCarry),fumbles:num(s.fumbles),longRush:num(s.longRush??s.rushingLong),
      targets,receptions,receivingYards,receivingTD,yardsPerCatch:receptions?Number((receivingYards/receptions).toFixed(1)):num(s.yardsPerCatch),drops:num(s.drops),longReception:num(s.longReception??s.receivingLong),
      soloTackles,assistedTackles,tackles:tackles||soloTackles+assistedTackles,tacklesForLoss:num(s.tacklesForLoss??s.tfl),sacks,defensiveInterceptions,passDeflections:num(s.passDeflections??s.pd),forcedFumbles:num(s.forcedFumbles),fumbleRecoveries:num(s.fumbleRecoveries),defensiveTD:num(s.defensiveTD??s.defensiveTouchdowns),
      fgm,fga,fgPct:fga?Number((fgm/fga*100).toFixed(1)):num(s.fgPct),longFieldGoal:num(s.longFieldGoal??s.long),xpm,xpa,points:num(s.points??(fgm*3+xpm)),
      punts,puntYards,average:punts?Number((puntYards/punts).toFixed(1)):num(s.average??s.puntAverage),netAverage:num(s.netAverage),inside20:num(s.inside20),touchbacks:num(s.touchbacks),longPunt:num(s.longPunt??s.long),
      fantasy:num(s.fantasy)
    };
  }
  function normalizedPlayers(){
    const teams=teamMap();
    return rawPlayers().map(p=>{
      const stats=normalizeStats(p);const team=teams.get(String(p.teamId));
      return {id:p.id,name:p.name,position:String(p.position||'').toUpperCase(),teamId:p.teamId,teamName:team?.fullName||team?.name||'',teamAbbr:team?.abbr||'',overall:num(p.overall),stats,gameLog:clone(p.stats?.gameLog||p.stats?.weekly||p.raw?.stats?.gameLog||[])};
    });
  }
  function categoryRows(category,options={}){
    const positions=categoryPositions[category]||categoryPositions.passing;
    let rows=normalizedPlayers().filter(p=>positions.includes(p.position));
    if(options.teamId&&options.teamId!=='All')rows=rows.filter(p=>String(p.teamId)===String(options.teamId));
    if(options.position&&options.position!=='All')rows=rows.filter(p=>p.position===options.position);
    const minimum=num(options.minimumGames,0);if(minimum)rows=rows.filter(p=>p.stats.games>=minimum);
    const sortKey=options.sortKey||categorySort[category];const direction=options.direction==='asc'?1:-1;
    rows.sort((a,b)=>direction*(num(a.stats[sortKey])-num(b.stats[sortKey]))||String(a.name).localeCompare(String(b.name)));
    return rows.map((row,index)=>({...row,rank:index+1,category}));
  }
  function getPlayerStats(playerId){const row=normalizedPlayers().find(p=>String(p.id)===String(playerId));return row?freeze(clone(row)):null}
  function getPlayerGameLog(playerId){const row=getPlayerStats(playerId);return freeze(clone(row?.gameLog||[]))}
  function getLeagueLeaders(category='passing',options={}){return freeze(clone(categoryRows(category,options).slice(0,num(options.limit,100))))}
  function getSeasonTotals(options={}){const categories=options.category?[options.category]:Object.keys(categoryPositions);const out={};categories.forEach(c=>out[c]=categoryRows(c,options));return freeze(clone(out))}
  function getWeeklyLeaders(week,category='passing',options={}){
    const positions=categoryPositions[category]||[];const key=categorySort[category];
    const rows=normalizedPlayers().filter(p=>positions.includes(p.position)).map(p=>{const log=(p.gameLog||[]).find(g=>num(g.week)===num(week));return log?{...p,stats:normalizeStats({...p,stats:log}),week:num(week)}:null}).filter(Boolean);
    rows.sort((a,b)=>num(b.stats[key])-num(a.stats[key]));return freeze(clone(rows.map((r,i)=>({...r,rank:i+1})).slice(0,num(options.limit,100))))
  }
  function getTeamStats(teamId){
    const team=teamMap().get(String(teamId));const players=normalizedPlayers().filter(p=>String(p.teamId)===String(teamId));
    const totals={};Object.keys(categoryPositions).forEach(c=>{totals[c]=categoryRows(c,{teamId})});
    const standing=(standingsService()?.getStandings?.()||[]).find(r=>String(r.teamId)===String(teamId))||{};
    const games=num(standing.games)||Math.max(1,...players.map(p=>p.stats.games));
    const passingYards=players.reduce((s,p)=>s+p.stats.passingYards,0),rushingYards=players.reduce((s,p)=>s+p.stats.rushingYards,0);
    const takeaways=players.reduce((s,p)=>s+p.stats.defensiveInterceptions+p.stats.fumbleRecoveries,0);
    const turnovers=players.reduce((s,p)=>s+p.stats.interceptions+p.stats.fumbles,0);
    return freeze(clone({teamId,team,players,totals,overview:{games,pointsFor:num(standing.pointsFor),pointsAgainst:num(standing.pointsAgainst),pointsPerGame:games?Number((num(standing.pointsFor)/games).toFixed(1)):0,pointsAllowedPerGame:games?Number((num(standing.pointsAgainst)/games).toFixed(1)):0,totalOffense:passingYards+rushingYards,passingOffense:passingYards,rushingOffense:rushingYards,turnovers,takeaways,turnoverDifferential:takeaways-turnovers,sacks:players.reduce((s,p)=>s+p.stats.sacks,0)}}))
  }
  function getTeamRankings(category='scoringOffense'){
    const standings=standingsService()?.getStandings?.()||[];
    const rows=appTeams().map(team=>{const t=getTeamStats(team.id),s=standings.find(r=>String(r.teamId)===String(team.id))||{};const values={scoringOffense:t.overview.pointsPerGame,scoringDefense:t.overview.pointsAllowedPerGame,totalOffense:t.overview.totalOffense,passingOffense:t.overview.passingOffense,rushingOffense:t.overview.rushingOffense,turnoverDifferential:t.overview.turnoverDifferential,sacks:t.overview.sacks,pointDifferential:num(s.pointDifferential)};return{teamId:team.id,team:team.fullName||team.name,abbr:team.abbr,games:t.overview.games,value:num(values[category]),category}});
    const ascending=category==='scoringDefense';rows.sort((a,b)=>(ascending?a.value-b.value:b.value-a.value)||String(a.team).localeCompare(String(b.team)));const avg=rows.length?rows.reduce((s,r)=>s+r.value,0)/rows.length:0;return freeze(clone(rows.map((r,i)=>({...r,rank:i+1,leagueAverage:Number(avg.toFixed(1))}))));
  }
  function diagnostics(){const players=normalizedPlayers(),teams=appTeams();const weeklyCount=players.reduce((s,p)=>s+(p.gameLog?.length||0),0);return freeze({service:'statistics',version:VERSION,season:gamesService()?.getSeason?.()?.season||gamesService()?.getSeason?.()?.year||2026,playerStatCount:players.length,teamStatCount:teams.length,weeklyStatCount:weeklyCount,categories:Object.keys(categoryPositions),healthy:Boolean(players.length&&teams.length),errorCount:0,warningCount:weeklyCount?0:1})}
  const service={getPlayerStats,getPlayerGameLog,getTeamStats,getLeagueLeaders,getSeasonTotals,getWeeklyLeaders,getTeamRankings,diagnostics};
  if(HQ.defineModuleService)HQ.defineModuleService('league','statistics',service,{alias:'leagueStatistics',replace:true});else{HQ.modules=HQ.modules||{};HQ.modules.league=HQ.modules.league||{};HQ.modules.league.statistics=service;HQ.leagueStatistics=service}
})(window);
