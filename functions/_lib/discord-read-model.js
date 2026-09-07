import {
  activeSnapshotDomainPage,
  activeSnapshotRecord
} from '../api/leagues/[leagueSlug]/snapshot/read-model.js';
import { activeLeagueTeams, resolveTeam } from './league-teams.js';
import { tradeCenterState } from '../api/leagues/[leagueSlug]/trade-center.js';
import { competitionState } from '../api/leagues/[leagueSlug]/competition.js';
import { leagueNewsState } from './league-news.js';
import { buildGmSeasonSummaries } from './gm-career.js';
import { currentFranchiseContext } from './ownership-periods.js';

const clean=value=>String(value??'').trim();
const lower=value=>clean(value).toLowerCase();
const number=value=>Number.isFinite(Number(value))?Number(value):null;
const rows=async(db,sql,...values)=>(await db.prepare(sql).bind(...values).all()).results||[];
const record=(wins=0,losses=0,ties=0)=>`${Number(wins||0)}-${Number(losses||0)}${Number(ties||0)?`-${Number(ties)}`:''}`;
const truncate=(value,max=1900)=>{
  const text=clean(value);
  return text.length<=max?text:`${text.slice(0,max-1)}…`;
};
const lines=(heading,items,empty='No matching records were found.')=>truncate([
  `**${heading}**`,...(items.length?items:[empty])
].join('\n'));

function teamName(teams,value){
  const team=resolveTeam(teams,value);
  return team?.abbreviation||team?.displayName||clean(value)||'Unknown';
}

async function allDomain(db,leagueId,snapshotId,domain,{compact=false,max=6000}={}){
  const result=[];
  let cursor=null;
  do{
    const page=await activeSnapshotDomainPage(db,leagueId,snapshotId,domain,cursor,500,compact);
    result.push(...page.records);
    cursor=page.nextCursor;
  }while(cursor&&result.length<max);
  return result.slice(0,max);
}

export async function discordLeagueReadModel(c,{domains=[]}={}){
  const snapshot=await activeSnapshotRecord(c.db,c.league.id);
  if(!snapshot)throw Object.assign(new Error('This league does not have an active Madden snapshot yet.'),{status:409});
  const unique=[...new Set(domains)];
  const loaded=await Promise.all(unique.map(async domain=>[
    domain,await allDomain(c.db,c.league.id,snapshot.id,domain,{compact:domain==='statistics',max:domain==='statistics'?20000:6000})
  ]));
  const model={snapshot,...Object.fromEntries(loaded)};
  if(Array.isArray(model.teams)){
    const canonical=await activeLeagueTeams(c.db,c.league.id);
    model.teams=model.teams.map(source=>{
      const team=resolveTeam(canonical,source.id)||resolveTeam(canonical,source.abbreviation)||resolveTeam(canonical,source.displayName);
      return team?{...source,...team,record:source.record,source:{...(source.source||{}),teamKey:team.teamKey}}:source;
    });
  }
  return model;
}

function standingTeam(model,item){return resolveTeam(model.teams,item.teamId)||resolveTeam(model.teams,item.teamName)}
function standingConference(model,item){return clean(item.conference||standingTeam(model,item)?.conferenceName)}
function standingDivision(model,item){return clean(item.division||standingTeam(model,item)?.divisionName)}
function sortStandings(items){return items.sort((a,b)=>(number(a.rank)??999)-(number(b.rank)??999)||(b.wins||0)-(a.wins||0)||(a.losses||0)-(b.losses||0))}
function standingLine(model,item,index){
  const team=standingTeam(model,item);
  return `${item.rank||index+1}. **${team?.displayName||item.teamName||item.teamId}** (${team?.abbreviation||'—'}) · ${record(item.wins,item.losses,item.ties)}${item.seed?` · Seed ${item.seed}`:''}`;
}

export async function standingsCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','standings']});
  let standings=model.standings.length?model.standings:model.teams.map(team=>({
    teamId:team.id,teamName:team.displayName,wins:team.record?.wins,losses:team.record?.losses,
    ties:team.record?.ties,conference:team.conferenceName,division:team.divisionName,rank:null,seed:null
  }));
  let view=clean(values.view);
  if(!view&&values.scope)view=`${lower(values.scope)}:${clean(values.name)||'all'}`;
  view=view||'league';
  let title='League Standings',groupBy=null;
  if(view==='conference:all'||view==='conference')groupBy=item=>standingConference(model,item);
  else if(view==='division:all'||view==='division')groupBy=item=>standingDivision(model,item);
  else if(view.startsWith('conference:')){
    const requested=lower(view.slice('conference:'.length));
    standings=standings.filter(item=>lower(standingConference(model,item))===requested);
    title=`${view.slice('conference:'.length)} Conference Standings`;
  }else if(view.startsWith('division:')){
    const requested=lower(view.slice('division:'.length));
    standings=standings.filter(item=>lower(standingDivision(model,item))===requested);
    title=`${view.slice('division:'.length)} Standings`;
  }else if(view.startsWith('team:')){
    const team=resolveTeam(model.teams,view.slice('team:'.length));
    standings=team?standings.filter(item=>standingTeam(model,item)?.teamKey===team.teamKey):[];
    title=`${team?.displayName||view.slice('team:'.length)} Standings`;
  }else if(view!=='league'){
    const typed=lower(view),team=resolveTeam(model.teams,typed);
    if(team){standings=standings.filter(item=>standingTeam(model,item)?.teamKey===team.teamKey);title=`${team.displayName} Standings`;}
    else{
      const division=standings.find(item=>lower(standingDivision(model,item))===typed)?.division;
      const conference=standings.find(item=>lower(standingConference(model,item))===typed)?.conference;
      if(division){standings=standings.filter(item=>lower(standingDivision(model,item))===typed);title=`${division} Standings`;}
      else if(conference){standings=standings.filter(item=>lower(standingConference(model,item))===typed);title=`${conference} Conference Standings`;}
    }
  }
  if(groupBy){
    const groups=new Map();
    for(const item of standings){const key=groupBy(item)||'Unassigned';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item)}
    const grouped=[];
    for(const key of [...groups.keys()].sort()){grouped.push(`__${key}__`);grouped.push(...sortStandings(groups.get(key)).map((item,index)=>standingLine(model,item,index)))}
    return lines(`${c.league.name} · ${view.startsWith('division')?'Division':'Conference'} Standings`,grouped);
  }
  return lines(`${c.league.name} · ${title}`,sortStandings(standings).slice(0,32).map((item,index)=>standingLine(model,item,index)));
}

function gamePlayed(game){
  return /final|complete|played/i.test(clean(game.status))||game.homeScore!==null&&game.awayScore!==null;
}

export async function scheduleCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','games']});
  const currentWeek=number(model.snapshot.week_index)??number(c.league.current_week)??1;
  let view=clean(values.view);
  if(!view&&values.scope)view=lower(values.scope)==='week'?`week:${number(values.week)??currentWeek}`:'season';
  view=view||`week:${currentWeek}`;
  let week=null,requestedTeam='';
  if(/^week:\d+$/i.test(view))week=number(view.split(':')[1]);
  else if(/^week\s*\d+$/i.test(view))week=number(view.match(/\d+/)?.[0]);
  else if(view.startsWith('team:'))requestedTeam=view.slice('team:'.length);
  else if(view!=='season')requestedTeam=view;
  const status=lower(values.status)||'all';
  let games=model.games.filter(game=>week===null||number(game.week)===week);
  if(status==='played')games=games.filter(gamePlayed);
  if(status==='unplayed')games=games.filter(game=>!gamePlayed(game));
  if(requestedTeam){
    const team=resolveTeam(model.teams,requestedTeam);
    if(!team)throw Object.assign(new Error('That team was not found in the active league.'),{status:404});
    games=games.filter(game=>[game.homeTeamId,game.awayTeamId].some(id=>resolveTeam(model.teams,id)?.teamKey===team.teamKey));
  }
  games.sort((a,b)=>(a.week??0)-(b.week??0)||clean(a.scheduledAt).localeCompare(clean(b.scheduledAt)));
  if(view==='season'&&!requestedTeam){
    const weekRows=[...new Set(games.map(game=>number(game.week)).filter(value=>value!==null))].sort((a,b)=>a-b).map(value=>{
      const weekGames=games.filter(game=>number(game.week)===value);
      const played=weekGames.filter(gamePlayed).length;
      return `**Week ${value}** · ${weekGames.length} games · ${played} played · ${weekGames.length-played} unplayed`;
    });
    return lines(`${c.league.name} · Season Schedule`,[
      ...weekRows,
      `Full schedule: https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#schedule`
    ]);
  }
  const selectedTeam=requestedTeam?resolveTeam(model.teams,requestedTeam):null;
  return lines(`${c.league.name} · ${selectedTeam?`${selectedTeam.displayName} Schedule`:week===null?'Season Schedule':`Week ${week}`}`,games.slice(0,40).map(game=>{
    const away=teamName(model.teams,game.awayTeamId),home=teamName(model.teams,game.homeTeamId);
    return gamePlayed(game)
      ?`W${game.week} · **${away} ${game.awayScore??'—'} @ ${home} ${game.homeScore??'—'}**`
      :`W${game.week} · **${away} @ ${home}**${game.scheduledAt?` · ${game.scheduledAt}`:''}`;
  }));
}

function embedColor(value){const hex=clean(value).replace(/^#/,'');return /^[0-9a-f]{6}$/i.test(hex)?Number.parseInt(hex,16):0x4f8cff}

export async function playerCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','players','statistics']});
  const query=lower(values.name);
  const matches=model.players.filter(player=>[
    player.displayName,player.publicId,player.id
  ].some(value=>lower(value)===query)||lower(player.displayName).includes(query)).slice(0,8);
  if(!matches.length)return lines(`${c.league.name} · Player Search`,[]);
  const player=matches[0],team=resolveTeam(model.teams,player.teamId);
  const href=`https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#players/${encodeURIComponent(player.publicId||player.id)}`;
  const seasonRows=meaningfulStats(model.statistics.filter(stat=>String(stat.playerId)===String(player.id)),model.snapshot);
  const highlights=[];
  for(const category of ['passing','rushing','receiving','defense']){
    const totals=aggregateCategory(seasonRows.filter(stat=>lower(stat.category)===category),category);
    const entry=displayMetricEntries(totals,category).find(([,value])=>Number(value)>0);
    if(entry)highlights.push(`${metricLabel(entry[0])}: ${formatMetric(entry[1])}`);
  }
  return {content:`${href}`,embeds:[{
    title:player.displayName,url:href,color:embedColor(team?.primaryColor),
    description:`${team?.displayName||'Team unavailable'} · ${player.position||'Position unavailable'}`,
    fields:[
      {name:'Overall',value:String(player.overall??'—'),inline:true},
      {name:'Age',value:String(player.age??'—'),inline:true},
      {name:'Development',value:clean(player.devTrait)||'Normal',inline:true},
      {name:`${model.snapshot.season_year||'Current'} season`,value:highlights.join(' · ')||'No completed-game statistics yet.',inline:false}
    ],footer:{text:`${c.league.name} · FranchiseHQ Player Card`}
  }]};
}

const METRIC_DEFINITIONS={
  passing:[['passYds','Pass Yds','sum'],['passTDs','Pass TDs','sum'],['passComp','Completions','sum'],['passAtt','Attempts','sum'],['passCompPct','Comp %','derived'],['passInts','INTs','sum'],['passerRating','Passer Rating','derived'],['passSacks','Sacks Taken','sum'],['passLongest','Long','max']],
  rushing:[['rushYds','Rush Yds','sum'],['rushTDs','Rush TDs','sum'],['rushAtt','Carries','sum'],['rushYdsPerAtt','Yds / Carry','derived'],['rushFum','Fumbles','sum'],['rushBrokenTackles','Broken Tackles','sum'],['rushLongest','Long','max']],
  receiving:[['recYds','Rec Yds','sum'],['recTDs','Rec TDs','sum'],['recCatches','Receptions','sum'],['recYdsPerCatch','Yds / Catch','derived'],['recDrops','Drops','sum'],['recYdsAfterCatch','YAC','sum'],['recLongest','Long','max']],
  defense:[['defTotalTackles','Tackles','sum'],['defSacks','Sacks','sum'],['defInts','INTs','sum'],['defForcedFum','Forced Fumbles','sum'],['defFumRec','Fumble Recoveries','sum'],['defTDs','Defensive TDs','sum'],['defDeflections','Pass Deflections','sum']],
  kicking:[['kickPts','Kicking Points','sum'],['fGMade','FG Made','sum'],['fGAtt','FG Attempts','sum'],['fGCompPct','FG %','derived'],['fG50PlusMade','50+ Made','sum'],['xPMade','XP Made','sum'],['xPAtt','XP Attempts','sum']],
  punting:[['puntYds','Punt Yds','sum'],['puntNetYds','Net Punt Yds','sum'],['puntAtt','Punts','sum'],['puntYdsPerAtt','Yds / Punt','derived'],['puntsIn20','Inside 20','sum'],['puntLongest','Long','max']]
};
const METRIC_LABELS=new Map(Object.values(METRIC_DEFINITIONS).flat().map(([key,label])=>[key,label]));

function metricLabel(value){
  return METRIC_LABELS.get(value)||clean(value).replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,letter=>letter.toUpperCase());
}

function clamp(value,min,max){return Math.max(min,Math.min(max,value))}
function passerRating(totals){
  const attempts=Number(totals.passAtt||0);if(!attempts)return null;
  const a=clamp(((Number(totals.passComp||0)/attempts)-0.3)*5,0,2.375);
  const b=clamp(((Number(totals.passYds||0)/attempts)-3)*0.25,0,2.375);
  const c=clamp((Number(totals.passTDs||0)/attempts)*20,0,2.375);
  const d=clamp(2.375-(Number(totals.passInts||0)/attempts)*25,0,2.375);
  return (a+b+c+d)/6*100;
}

function aggregateCategory(stats,category){
  const definitions=METRIC_DEFINITIONS[category]||[];
  const totals={};
  for(const stat of stats){
    const metrics=stat?.metrics&&typeof stat.metrics==='object'?stat.metrics:{};
    for(const [key,,mode] of definitions){
      if(!['sum','max'].includes(mode)||!Number.isFinite(Number(metrics[key])))continue;
      totals[key]=mode==='max'?Math.max(Number(totals[key]||0),Number(metrics[key])):Number(totals[key]||0)+Number(metrics[key]);
    }
  }
  if(category==='passing'){
    totals.passCompPct=totals.passAtt?totals.passComp/totals.passAtt*100:null;
    totals.passerRating=passerRating(totals);
  }else if(category==='rushing')totals.rushYdsPerAtt=totals.rushAtt?totals.rushYds/totals.rushAtt:null;
  else if(category==='receiving')totals.recYdsPerCatch=totals.recCatches?totals.recYds/totals.recCatches:null;
  else if(category==='kicking')totals.fGCompPct=totals.fGAtt?totals.fGMade/totals.fGAtt*100:null;
  else if(category==='punting')totals.puntYdsPerAtt=totals.puntAtt?totals.puntYds/totals.puntAtt:null;
  return totals;
}

function displayMetricEntries(totals,category){
  return (METRIC_DEFINITIONS[category]||[]).map(([key])=>[key,totals[key]])
    .filter(([,value])=>value!==null&&value!==undefined&&Number.isFinite(Number(value)));
}

function formatMetric(value){
  const numeric=Number(value);if(!Number.isFinite(numeric))return clean(value)||'—';
  return Number.isInteger(numeric)?numeric.toLocaleString('en-US'):numeric.toFixed(1);
}

function meaningfulStats(stats,snapshot){
  return stats.filter(stat=>{
    const provenance=lower(`${stat.stage||''} ${stat.source?.routePath||''}`);
    return !provenance.includes('preseason')&&!/\/week\/pre(?:\/|$)/.test(provenance);
  }).map(stat=>({
    ...stat,season:Number(stat.season??stat.seasonYear??snapshot?.season_year)||Number(snapshot?.season_year)||null
  }));
}

function exactPlayer(model,query){
  const wanted=lower(query);
  return model.players.find(player=>[player.publicId,player.id].some(value=>lower(value)===wanted))
    ||model.players.find(player=>lower(player.displayName)===wanted)
    ||model.players.find(player=>lower(player.displayName).includes(wanted));
}

export async function playerStatsCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','players','statistics']});
  const player=exactPlayer(model,values.player||values.name);
  if(!player)throw Object.assign(new Error('That player was not found in the active Franchise.'),{status:404});
  const selected=lower(values.category),stats=meaningfulStats(model.statistics.filter(stat=>String(stat.playerId)===String(player.id)),model.snapshot);
  const seasons=[...new Set(stats.map(stat=>stat.season).filter(Boolean))].sort((a,b)=>a-b);
  const items=[];
  for(const season of seasons){
    const seasonStats=stats.filter(stat=>stat.season===season);
    if(selected){
      const totals=aggregateCategory(seasonStats.filter(stat=>lower(stat.category)===selected),selected);
      const summary=displayMetricEntries(totals,selected).slice(0,8).map(([key,value])=>`${metricLabel(key)} ${formatMetric(value)}`).join(' · ');
      if(summary)items.push(`**${season} · ${metricLabel(selected)}**\n${summary}`);
    }else{
      const summary=[];
      for(const category of ['passing','rushing','receiving','defense','kicking','punting']){
        const entries=displayMetricEntries(aggregateCategory(seasonStats.filter(stat=>lower(stat.category)===category),category),category);
        const primary=entries.find(([,value])=>Number(value)>0);
        if(primary)summary.push(`${metricLabel(primary[0])} ${formatMetric(primary[1])}`);
      }
      if(summary.length)items.push(`**${season}**\n${summary.join(' · ')}`);
    }
  }
  return lines(`${c.league.name} · ${player.displayName} Franchise Career`,items,'No completed-game career statistics are available for this player.');
}

export async function teamStatsCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','statistics']});
  const team=resolveTeam(model.teams,values.team||values.name);
  if(!team)throw Object.assign(new Error('That team was not found in the active league.'),{status:404});
  const selected=lower(values.category),stats=meaningfulStats(model.statistics.filter(stat=>resolveTeam(model.teams,stat.teamId)?.teamKey===team.teamKey),model.snapshot);
  const categories=selected?[selected]:['passing','rushing','receiving','defense','kicking','punting'];
  const items=categories.map(category=>{
    const totals=aggregateCategory(stats.filter(stat=>lower(stat.category)===category),category);
    const summary=displayMetricEntries(totals,category).slice(0,8).map(([key,value])=>`${metricLabel(key)} ${formatMetric(value)}`).join(' · ');
    return summary?`**${metricLabel(category)}**\n${summary}`:null;
  }).filter(Boolean);
  return lines(`${c.league.name} · ${team.displayName} · ${model.snapshot.season_year||'Current'} Team Stats`,items,'No completed-game team statistics are available.');
}

export async function leadersCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','players','statistics']});
  const category=lower(values.category)||'passing';
  const definitions=METRIC_DEFINITIONS[category]||METRIC_DEFINITIONS.passing;
  const requested=clean(values.metric);
  const metric=definitions.some(([key])=>key===requested)?requested:definitions[0][0];
  const stats=meaningfulStats(model.statistics.filter(stat=>lower(stat.category)===category),model.snapshot);
  const byPlayer=new Map();
  for(const stat of stats){const id=String(stat.playerId||'');if(!id)continue;if(!byPlayer.has(id))byPlayer.set(id,[]);byPlayer.get(id).push(stat)}
  const playerMap=new Map(model.players.map(player=>[String(player.id),player]));
  const ranked=[...byPlayer].map(([playerId,rows])=>({playerId,value:aggregateCategory(rows,category)[metric]}))
    .filter(item=>Number.isFinite(Number(item.value))).sort((a,b)=>Number(b.value)-Number(a.value)).slice(0,10);
  return lines(`${c.league.name} · ${metricLabel(metric)} Leaders`,ranked.map((item,index)=>{
    const player=playerMap.get(item.playerId);
    return `${index+1}. **${player?.displayName||item.playerId}** · ${teamName(model.teams,player?.teamId)} · ${formatMetric(item.value)}`;
  }));
}

export async function statsCommand(c,values,{leaders=false}={}){
  if(leaders)return leadersCommand(c,values);
  return lower(values.target)==='team'?teamStatsCommand(c,{...values,team:values.name}):playerStatsCommand(c,{...values,player:values.name});
}

export async function tradeBlockCommand(c,values){
  c.teams=await activeLeagueTeams(c.db,c.league.id);
  const state=await tradeCenterState(c);
  const teamQuery=lower(values.team),position=lower(values.position);
  let listings=state.listings;
  if(teamQuery)listings=listings.filter(item=>{
    const team=resolveTeam(state.teams,item.teamKey);
    return [item.teamKey,team?.displayName,team?.abbreviation].some(value=>lower(value).includes(teamQuery));
  });
  const model=await discordLeagueReadModel(c,{domains:['players']});
  const playerByPublicId=new Map(model.players.map(player=>[String(player.publicId||''),player]));
  if(position)listings=listings.filter(item=>lower(playerByPublicId.get(String(item.playerPublicId||''))?.position).includes(position));
  const needs=new Map(state.teamNeeds.map(item=>[item.teamKey,item.needs]));
  if(!listings.length)return lines(`${c.league.name} · Trade Block`,[],'No matching players are currently listed.');
  const fields=listings.slice(0,25).map(item=>{
    const player=playerByPublicId.get(String(item.playerPublicId||''));
    const href=player?`https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#players/${encodeURIComponent(player.publicId||player.id)}`:null;
    const looking=item.requestedReturn||needs.get(item.teamKey)?.join(', ')||'Open to offers';
    return {name:href?`[${item.playerName||'Trade asset'}](${href})`:item.playerName||item.draftPickId||'Trade asset',
      value:[teamName(state.teams,item.teamKey),player?.position,player?.overall!=null?`${player.overall} OVR`:null,player?.age!=null?`Age ${player.age}`:null,player?.devTrait?`${player.devTrait} Dev`:null,`Looking for: ${looking}`].filter(Boolean).join(' · '),inline:false};
  });
  return {content:`**${c.league.name} · Trade Block** · ${listings.length} listed${listings.length>25?' · first 25 shown':''}\nhttps://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#trade-block`,embeds:[{
    title:'League Trade Block',color:0x4f8cff,fields,footer:{text:'Player names open the canonical FranchiseHQ Player Card.'}
  }]};
}

export async function tradeHistoryCommand(c){
  const result=await rows(c.db,`SELECT workflow.id,workflow.approved_at AS approvedAt,
      group_concat(participant.team_key, ' ↔ ') AS teams
    FROM trade_workflows workflow
    INNER JOIN trade_workflow_participants participant ON participant.trade_id=workflow.id AND participant.league_id=workflow.league_id
    WHERE workflow.league_id=? AND workflow.status='approved'
    GROUP BY workflow.id,workflow.approved_at
    ORDER BY workflow.approved_at DESC,workflow.updated_at DESC LIMIT 20`,c.league.id);
  return lines(`${c.league.name} · Approved Trade History`,result.map(item=>
    `**${item.teams||'League trade'}** · ${item.approvedAt||'Approved'}\nhttps://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#trade-center/${encodeURIComponent(item.id)}`
  ));
}

export async function newsCommand(c){
  const state=await leagueNewsState({...c,limit:10});
  return lines(`${c.league.name} · Latest News`,state.posts.map(item=>
    `**${item.title}** · ${item.category}\n${item.summary||truncate(item.body,180)}`
  ),'No commissioner-published news is available yet.');
}

export async function gotwCommand(c,values){
  const state=await competitionState(c);
  const week=number(values.week)??number(state.context.currentWeek);
  const gameId=state.gotw[`regular:${week}`];
  const game=state.games.find(item=>item.id===gameId);
  if(!game)return lines(`${c.league.name} · Game of the Week`,[],`No Game of the Week is published for Week ${week}.`);
  const teams=await discordLeagueReadModel(c,{domains:['teams']});
  return lines(`${c.league.name} · Week ${week} Game of the Week`,[
    `**${teamName(teams.teams,game.awayTeamId)} @ ${teamName(teams.teams,game.homeTeamId)}**`
  ]);
}

export async function rulesCommand(c,values){
  const row=await c.db.prepare(`SELECT rules_json AS rulesJson FROM league_rules_documents WHERE league_id=?`).bind(c.league.id).first();
  let rules={categories:[]};try{rules=JSON.parse(row?.rulesJson||'{"categories":[]}')}catch{}
  const query=lower(values.query);
  const found=[];
  const direct=query.match(/^(category|section|rule):(\d+)(?::(\d+))?(?::(\d+))?$/);
  for(const [categoryIndex,category] of (rules.categories||[]).entries())for(const [sectionIndex,section] of (category.sections||[]).entries())for(const [ruleIndex,rule] of (section.rules||[]).entries()){
    const text=clean(rule.text||clean(rule.html).replace(/<[^>]*>/g,' '));
    const haystack=lower([category.title,section.title,rule.title,text].join(' '));
    const selected=direct
      ?direct[1]==='category'&&Number(direct[2])===categoryIndex
        ||direct[1]==='section'&&Number(direct[2])===categoryIndex&&Number(direct[3])===sectionIndex
        ||direct[1]==='rule'&&Number(direct[2])===categoryIndex&&Number(direct[3])===sectionIndex&&Number(direct[4])===ruleIndex
      :!query||haystack.includes(query);
    if(selected)found.push(`**${category.title} · ${section.title}${rule.title?` · ${rule.title}`:''}**\n${text}`);
  }
  return lines(`${c.league.name} · League Rules`,found.slice(0,15));
}

export async function gmHistoryCommand(c,values){
  const query=lower(values.name);
  const model=await discordLeagueReadModel(c,{domains:['teams','games']});
  const context=await currentFranchiseContext(c.db,c.league.id);
  const periods=await rows(c.db,`SELECT gm_identity_id AS gmIdentityId,team_key AS teamKey,
      franchise_season_id AS franchiseSeasonId,started_stage AS startedStage,started_week AS startedWeek,
      ended_stage AS endedStage,ended_week AS endedWeek FROM team_ownership_periods WHERE league_id=?`,c.league.id);
  const games=model.games.map(game=>({
    ...game,franchiseSeasonId:context.franchiseSeasonId,
    homeTeamKey:resolveTeam(model.teams,game.homeTeamId)?.teamKey||'',
    awayTeamKey:resolveTeam(model.teams,game.awayTeamId)?.teamKey||''
  }));
  const live=buildGmSeasonSummaries({games,periods,franchiseSeasonId:context.franchiseSeasonId});
  const liveByIdentity=new Map(live.summaries.map(summary=>[String(summary.gmIdentityId),summary]));
  const result=await rows(c.db,`SELECT identity.id,identity.user_id AS userId,identity.display_name AS displayName,identity.public_id AS publicId,
      COALESCE(SUM(summary.regular_wins),0) AS wins,COALESCE(SUM(summary.regular_losses),0) AS losses,
      COALESCE(SUM(summary.regular_ties),0) AS ties,COALESCE(SUM(summary.playoff_appearance),0) AS playoffs,
      COALESCE(SUM(summary.super_bowl_appearances),0) AS superBowls,
      COALESCE(SUM(summary.super_bowl_championships),0) AS championships
    FROM gm_identities identity
    LEFT JOIN gm_season_summaries summary ON summary.league_id=identity.league_id AND summary.gm_identity_id=identity.id
    WHERE identity.league_id=?
    GROUP BY identity.id,identity.display_name,identity.public_id
    ORDER BY championships DESC,wins DESC,displayName`,c.league.id);
  const combined=result.map(item=>{
    const current=liveByIdentity.get(String(item.id));
    const teams=[...new Set(periods.filter(period=>String(period.gmIdentityId)===String(item.id)).map(period=>period.teamKey))];
    return {...item,teams,wins:Number(item.wins||0)+Number(current?.regularWins||0),
      losses:Number(item.losses||0)+Number(current?.regularLosses||0),ties:Number(item.ties||0)+Number(current?.regularTies||0),
      playoffs:Number(item.playoffs||0)+Number(current?.playoffAppearance||0),
      superBowls:Number(item.superBowls||0)+Number(current?.superBowlAppearances||0),
      championships:Number(item.championships||0)+Number(current?.superBowlChampionships||0)};
  }).sort((a,b)=>b.championships-a.championships||b.wins-a.wins||clean(a.displayName).localeCompare(clean(b.displayName)));
  const filtered=query?combined.filter(item=>[item.displayName,item.publicId,item.userId,...item.teams]
    .some(value=>lower(value).includes(query))):combined;
  return lines(`${c.league.name} · GM History`,filtered.slice(0,25).map((item,index)=>
    `${index+1}. **${item.displayName}** · ${record(item.wins,item.losses,item.ties)} · ${item.playoffs} playoffs · ${item.superBowls} Super Bowls · ${item.championships} titles`
  ),'No current or archived GM results are available.');
}

export async function twitchViewCommand(c,values,interaction){
  const requested=clean(values.member)||String(interaction?.member?.user?.id||interaction?.user?.id||'');
  const row=await c.db.prepare(`SELECT user.display_name AS displayName,profile.twitch_url AS twitchUrl
    FROM users user
    INNER JOIN league_memberships membership ON membership.user_id=user.id AND membership.league_id=? AND membership.active=1
    LEFT JOIN user_stream_profiles profile ON profile.user_id=user.id
    WHERE user.discord_user_id=? LIMIT 1`).bind(c.league.id,requested).first();
  if(!row)throw Object.assign(new Error('That Discord member is not active in this league.'),{status:404});
  return lines(`${c.league.name} · Twitch`,[],row.twitchUrl?`**${row.displayName}**\n${row.twitchUrl}`:`${row.displayName} has not added a Twitch channel.`);
}

export async function confidenceViewCommand(c){
  const state=await competitionState(c);
  const picks=Object.values(state.confidence.entry.picks||{}).sort((a,b)=>a.week-b.week||clean(a.gameId).localeCompare(clean(b.gameId)));
  return lines(`${c.league.name} · Your Confidence Pool`,picks.map(pick=>
    `W${pick.week} · **${pick.gameId}** · ${pick.selectedTeamId||'No pick'} · Confidence ${pick.confidence??'—'}`
  ),'You have not saved any Confidence Pool picks.');
}
