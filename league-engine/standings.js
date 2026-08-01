(function initStandingsService(global){
  'use strict';
  const HQ=global.FranchiseHQ=global.FranchiseHQ||{};
  const clone=v=>JSON.parse(JSON.stringify(v));
  const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v)}return v};
  const gamesService=()=>HQ.modules?.league?.games||HQ.leagueGames;
  const teams=()=>global.FGC_APP?.teams||[];
  const teamMap=()=>new Map(teams().map(t=>[String(t.id),t]));
  const isFinal=g=>String(g?.status||'').toLowerCase()==='final';
  const isRegular=g=>!(/preseason|playoff|wild|divisional|conference|super\s?bowl|championship/i.test(String(g?.phase||g?.gameType||g?.round||'')));
  const pct=(w,l,t)=>{const n=w+l+t;return n?Number(((w+t*.5)/n).toFixed(3)):0};
  function baseRows(){return teams().map(t=>({teamId:t.id,team:t.fullName||`${t.city||''} ${t.name||''}`.trim(),abbr:t.abbr,conference:t.conference,division:t.division,wins:0,losses:0,ties:0,pointsFor:0,pointsAgainst:0,divisionWins:0,divisionLosses:0,divisionTies:0,conferenceWins:0,conferenceLosses:0,conferenceTies:0,streak:'—',lastFive:'—'}))}
  function calculate(){
    const rows=baseRows(), map=new Map(rows.map(r=>[String(r.teamId),r])), tm=teamMap();
    const completed=(gamesService()?.getCompletedGames?.()||[]).filter(isFinal).filter(isRegular).slice().sort((a,b)=>Number(a.week)-Number(b.week)||String(a.id).localeCompare(String(b.id)));
    const outcomes=new Map(rows.map(r=>[String(r.teamId),[]]));
    completed.forEach(g=>{
      const h=map.get(String(g.homeId)),a=map.get(String(g.awayId)); if(!h||!a)return;
      const hs=Number(g.homeScore)||0,as=Number(g.awayScore)||0; h.pointsFor+=hs;h.pointsAgainst+=as;a.pointsFor+=as;a.pointsAgainst+=hs;
      const ht=tm.get(String(g.homeId)),at=tm.get(String(g.awayId)); const sameDiv=ht&&at&&ht.conference===at.conference&&ht.division===at.division; const sameConf=ht&&at&&ht.conference===at.conference;
      let ho='T',ao='T'; if(hs>as){h.wins++;a.losses++;ho='W';ao='L'}else if(as>hs){a.wins++;h.losses++;ho='L';ao='W'}else{h.ties++;a.ties++}
      if(sameDiv){if(ho==='W'){h.divisionWins++;a.divisionLosses++}else if(ho==='L'){h.divisionLosses++;a.divisionWins++}else{h.divisionTies++;a.divisionTies++}}
      if(sameConf){if(ho==='W'){h.conferenceWins++;a.conferenceLosses++}else if(ho==='L'){h.conferenceLosses++;a.conferenceWins++}else{h.conferenceTies++;a.conferenceTies++}}
      outcomes.get(String(h.teamId)).push(ho);outcomes.get(String(a.teamId)).push(ao);
    });
    rows.forEach(r=>{r.games=r.wins+r.losses+r.ties;r.winPct=pct(r.wins,r.losses,r.ties);r.record=`${r.wins}-${r.losses}${r.ties?`-${r.ties}`:''}`;r.divisionRecord=`${r.divisionWins}-${r.divisionLosses}${r.divisionTies?`-${r.divisionTies}`:''}`;r.conferenceRecord=`${r.conferenceWins}-${r.conferenceLosses}${r.conferenceTies?`-${r.conferenceTies}`:''}`;r.pointDifferential=r.pointsFor-r.pointsAgainst;const seq=outcomes.get(String(r.teamId))||[];const last=seq.at(-1);let count=0;for(let i=seq.length-1;i>=0&&seq[i]===last;i--)count++;r.streak=last?`${last}${count}`:'—';r.lastFive=seq.slice(-5).join('')||'—'});
    return rows;
  }
  function sortRows(a,b){return b.winPct-a.winPct||b.wins-a.wins||b.pointDifferential-a.pointDifferential||b.pointsFor-a.pointsFor||String(a.team).localeCompare(String(b.team))}
  function getStandings(){return freeze(clone(calculate().sort(sortRows).map((r,i)=>({...r,leagueRank:i+1}))))}
  function getConferenceStandings(conf){const all=calculate();const conferences=conf?[conf]:[...new Set(all.map(r=>r.conference))];const result={};conferences.forEach(c=>{result[c]=all.filter(r=>r.conference===c).sort(sortRows).map((r,i)=>({...r,conferenceRank:i+1}))});return freeze(clone(conf?result[conf]||[]:result))}
  function getDivisionStandings(conf,div){const all=calculate();if(conf&&div)return freeze(clone(all.filter(r=>r.conference===conf&&r.division===div).sort(sortRows).map((r,i)=>({...r,divisionRank:i+1}))));const result={};all.forEach(r=>{const key=`${r.conference} ${r.division}`;(result[key]||(result[key]=[])).push(r)});Object.keys(result).forEach(k=>result[k]=result[k].sort(sortRows).map((r,i)=>({...r,divisionRank:i+1})));return freeze(clone(result))}
  function getPlayoffPicture(conf){const confs=conf?[conf]:['AFC','NFC'];const divisions=getDivisionStandings(),result={};confs.forEach(c=>{const divisionWinners=Object.entries(divisions).filter(([k])=>k.startsWith(`${c} `)).map(([,v])=>v[0]).filter(Boolean).sort(sortRows);const winnerIds=new Set(divisionWinners.map(r=>r.teamId));const wildcards=(getConferenceStandings(c)||[]).filter(r=>!winnerIds.has(r.teamId)).slice(0,3);const inHunt=(getConferenceStandings(c)||[]).filter(r=>!winnerIds.has(r.teamId)&&!wildcards.some(w=>w.teamId===r.teamId)).slice(0,3);result[c]={seeds:[...divisionWinners,...wildcards].sort(sortRows).map((r,i)=>({...r,seed:i+1,type:i<4?'Division leader':'Wild card'})),inHunt}});return freeze(clone(conf?result[conf]:result))}
  function poolSeason(){
    const conf=gamesService()?.confidence;const board=conf?.leaderboard?.()||[];const entryConfig=conf?.config?.()||{entries:{}};const allGames=gamesService()?.getAllGames?.()||[];const finalIds=new Set(allGames.filter(isFinal).map(g=>g.id));
    const rows=board.map(r=>{const weeks=(r.weeks||[]).slice();const bestWeek=weeks.reduce((m,w)=>Math.max(m,Number(w.points)||0),0);const avg=weeks.length?weeks.reduce((s,w)=>s+(Number(w.points)||0),0)/weeks.length:0;const remaining=Object.values(entryConfig.entries?.[r.userId]?.picks||{}).filter(p=>!finalIds.has(p.gameId)).reduce((s,p)=>s+(Number(p.confidence)||0),0);return{...r,weeksWon:0,bestWeek,averageWeeklyScore:Number(avg.toFixed(1)),remainingPossiblePoints:remaining,submitted:r.status==='submitted'}});
    const weekNumbers=[...new Set(rows.flatMap(r=>(r.weeks||[]).map(w=>Number(w.week))))];weekNumbers.forEach(w=>{const ranked=rows.map(r=>({r,points:Number((r.weeks||[]).find(x=>Number(x.week)===w)?.points||0)})).sort((a,b)=>b.points-a.points);if(ranked[0]?.points>0){const top=ranked[0].points;ranked.filter(x=>x.points===top).forEach(x=>x.r.weeksWon++)}});
    rows.sort((a,b)=>b.totalPoints-a.totalPoints||b.correctPicks-a.correctPicks||String(a.name).localeCompare(String(b.name)));return freeze(clone(rows.map((r,i)=>({...r,rank:i+1}))));
  }
  function poolWeek(week){const rows=poolSeason().map(r=>{const w=(r.weeks||[]).find(x=>Number(x.week)===Number(week))||{points:0,correct:0,finalGames:0};return{userId:r.userId,name:r.name,teamId:r.teamId,status:r.status,points:Number(w.points)||0,correctPicks:Number(w.correct)||0,finalGames:Number(w.finalGames)||0}}).sort((a,b)=>b.points-a.points||b.correctPicks-a.correctPicks||String(a.name).localeCompare(String(b.name)));return freeze(clone(rows.map((r,i)=>({...r,rank:i+1,week:Number(week)}))))}
  function diagnostics(){const standings=getStandings(),pool=poolSeason();return freeze({service:'standings',version:'5.6.1',teamCount:standings.length,completedGames:(gamesService()?.getCompletedGames?.()||[]).length,poolEntryCount:pool.length,healthy:Boolean(gamesService()&&standings.length)})}
  const service={getStandings,getDivisionStandings,getConferenceStandings,getPlayoffPicture,getConfidencePoolStandings:poolSeason,getConfidencePoolWeek:poolWeek,diagnostics};
  if(HQ.defineModuleService)HQ.defineModuleService('league','standings',service,{alias:'leagueStandings',replace:true});else{HQ.modules=HQ.modules||{};HQ.modules.league=HQ.modules.league||{};HQ.modules.league.standings=service;HQ.leagueStandings=service}
})(window);
