// Shared game-specific selection for League Home and Discord. Never use season totals.
const text=value=>String(value??'').trim();
const numeric=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
export function summaryStage(value){
  const stage=text(value).toLowerCase();
  return stage.includes('pre')?'preseason':/post|playoff/.test(stage)?'playoffs':'regular-season';
}
export function summaryGameFinal(game){
  const status=text(game.status).toLowerCase();
  if(/scheduled|pregame|not.?started|unplayed|pending|in.?progress|^live$|^playing$/.test(status)||status==='1')return false;
  return /final|complete|^played$/.test(status)||Boolean(game.completed)
    ||(numeric(game.homeScore)!==null&&numeric(game.awayScore)!==null&&(Number(game.homeScore)>0||Number(game.awayScore)>0));
}
const categories=['passing','rushing','receiving','defense'];
const metric=(metrics,key)=>numeric(metrics[key]);
const shown=(metrics,key)=>metric(metrics,key)??'—';
const line=(category,m)=>({
  passing:`${shown(m,'passComp')}/${shown(m,'passAtt')} · ${shown(m,'passYds')} YDS · ${shown(m,'passTDs')} TD · ${shown(m,'passInts')} INT`,
  rushing:`${shown(m,'rushAtt')} ATT · ${shown(m,'rushYds')} YDS · ${shown(m,'rushTDs')} TD`,
  receiving:`${shown(m,'recCatches')} REC · ${shown(m,'recYds')} YDS · ${shown(m,'recTDs')} TD`,
  defense:`${shown(m,'defTotalTackles')} TKL · ${shown(m,'defSacks')} SACK · ${shown(m,'defInts')} INT`
})[category];
const ranking=(category,m)=>category==='defense'
  ?(metric(m,'defInts')||0)*6+(metric(m,'defSacks')||0)*3+(metric(m,'defTotalTackles')||0)
  :metric(m,{passing:'passYds',rushing:'rushYds',receiving:'recYds'}[category])??-Infinity;
export function gameSummaryPerformers(game,statistics=[],players=[]){
  const playerMap=new Map();
  for(const player of players)for(const id of [player.id,player.publicId,player.source?.playerId,player.source?.rosterId])if(id)playerMap.set(text(id),player);
  const ids=new Set([game.id,game.gameId,game.source?.gameId,game.source?.scheduleId].filter(Boolean).map(text));
  const teams=[text(game.awayTeamId??game.awayId),text(game.homeTeamId??game.homeId)];
  const grouped=new Map();
  for(const row of statistics){
    const category=text(row.category).toLowerCase(),teamId=text(row.teamId),playerId=text(row.playerId);
    if(!categories.includes(category)||!playerId||!teams.includes(teamId))continue;
    if(Number(row.week??row.weekIndex)!==Number(game.week)||summaryStage(row.stage)!==summaryStage(game.stage))continue;
    const season=row.season??row.seasonYear,gameSeason=game.season??game.seasonYear;
    if(season!=null&&gameSeason!=null&&String(season)!==String(gameSeason))continue;
    const metrics=row.metrics||{},direct=text(row.source?.gameId??metrics.__gameId??metrics.gameId);
    if(direct&&!ids.has(direct))continue;
    const key=`${teamId}:${category}:${playerId}`,prior=grouped.get(key);
    grouped.set(key,{category,teamId,playerId,metrics:{...(prior?.metrics||{}),...metrics}});
  }
  return Object.fromEntries(teams.map(teamId=>[teamId,categories.map(category=>{
    const eligible=[...grouped.values()].filter(row=>row.teamId===teamId&&row.category===category
      &&Object.values(row.metrics).some(v=>numeric(v)!==null));
    eligible.sort((a,b)=>ranking(category,b.metrics)-ranking(category,a.metrics)||a.playerId.localeCompare(b.playerId));
    const winner=eligible[0],player=winner&&playerMap.get(winner.playerId);
    return {category,label:category==='rushing'?'Rushing':category[0].toUpperCase()+category.slice(1),
      playerId:winner?.playerId||null,name:winner?(player?.displayName||player?.name||'Player unavailable'):'Stats not available',
      detail:winner?line(category,winner.metrics):'Awaiting game statistics'};
  })]));
}
export function gamePreviewPlayers(teamId,players=[]){
  const offense=new Set(['QB','HB','RB','FB','WR','TE','LT','LG','C','RG','RT','OL']);
  const defense=new Set(['LE','RE','DT','DE','EDGE','LEDGE','REDGE','LEDG','REDG','LOLB','MLB','ROLB','LB','SAM','MIKE','WILL','CB','FS','SS','S']);
  const roster=players.filter(p=>text(p.teamId)===text(teamId)).sort((a,b)=>(Number(b.overall)||0)-(Number(a.overall)||0)||text(a.id).localeCompare(text(b.id)));
  return [['Offense',offense],['Defense',defense]].flatMap(([label,positions])=>{
    const selected=roster.filter(p=>positions.has(text(p.position).toUpperCase())).slice(0,2);
    return selected.length?selected.map(p=>({label,name:p.displayName||p.name,detail:`${p.position} · ${p.overall??'—'} OVR`} )):[{label,name:'Roster unavailable',detail:'Awaiting roster data'}];
  });
}
