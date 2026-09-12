import {
  activeSnapshotDomainPage,
  activeSnapshotRecord
} from '../api/leagues/[leagueSlug]/snapshot/read-model.js';
import { activeLeagueTeams, resolveTeam } from './league-teams.js';
import { applyRosterOverlays } from './trade-center.js';
import { tradeCenterState } from '../api/leagues/[leagueSlug]/trade-center.js';
import { competitionState } from '../api/leagues/[leagueSlug]/competition.js';
import { leagueNewsState } from './league-news.js';
import { buildGmSeasonSummaries } from './gm-career.js';
import { currentFranchiseContext } from './ownership-periods.js';

const clean=value=>String(value??'').trim();
const lower=value=>clean(value).toLowerCase();
const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
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
  let canonical=null;
  if(Array.isArray(model.teams)||Array.isArray(model.players))canonical=await activeLeagueTeams(c.db,c.league.id);
  if(Array.isArray(model.teams)){
    model.teams=model.teams.map(source=>{
      const team=resolveTeam(canonical,source.id)||resolveTeam(canonical,source.abbreviation)||resolveTeam(canonical,source.displayName);
      return team?{...source,...team,record:source.record,source:{...(source.source||{}),teamKey:team.teamKey}}:source;
    });
  }
  if(Array.isArray(model.players)&&model.players.length){
    const overlays=await rows(c.db,`SELECT source_player_id,to_team_key,internal_status
      FROM trade_roster_overlays WHERE league_id=? AND internal_status='active'`,c.league.id);
    const teamExternalIds=new Map((canonical||[]).map(team=>[team.teamKey,team.externalId]));
    model.players=applyRosterOverlays(model.players,overlays,teamExternalIds);
  }
  return model;
}

function standingTeam(model,item){return resolveTeam(model.teams,item.teamId)||resolveTeam(model.teams,item.teamName)}
function standingsTeamSearch(teams,value){
  const direct=resolveTeam(teams,value),wanted=lower(value);
  if(direct||!wanted)return direct;
  return teams.find(team=>[team.displayName,team.nickname,team.abbreviation]
    .some(candidate=>lower(candidate).includes(wanted)))||null;
}
function standingConference(model,item){return clean(item.conference||standingTeam(model,item)?.conferenceName)}
function standingDivision(model,item){return clean(item.division||standingTeam(model,item)?.divisionName)}
function playoffSeed(item){const value=number(item?.seed);return value!==null&&value>0?value:null}
function sortStandings(items,{preferSeed=false}={}){return items.sort((a,b)=>
  (preferSeed?(playoffSeed(a)??999)-(playoffSeed(b)??999):0)
  ||(number(a.rank)??999)-(number(b.rank)??999)
  ||(b.wins||0)-(a.wins||0)||(a.losses||0)-(b.losses||0)
  ||clean(a.teamName||a.teamId).localeCompare(clean(b.teamName||b.teamId)))}
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
  const typedView=lower(view).replace(/\s+/g,' ').trim();
  if(['division','divisions','division:all'].includes(typedView))view='division:all';
  else if(['conference','conferences','conference:all'].includes(typedView))view='conference:all';
  else if(/^division(?:\s+|:)(.+)$/i.test(view))view=`division:${clean(view.match(/^division(?:\s+|:)(.+)$/i)?.[1])}`;
  else if(/^conference(?:\s+|:)(.+)$/i.test(view))view=`conference:${clean(view.match(/^conference(?:\s+|:)(.+)$/i)?.[1])}`;
  else if(/^team(?:\s+|:)(.+)$/i.test(view))view=`team:${clean(view.match(/^team(?:\s+|:)(.+)$/i)?.[1])}`;
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
    const typed=lower(view),team=standingsTeamSearch(model.teams,typed);
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
    const title=`${c.league.name} · ${view.startsWith('division')?'Division':'Conference'} Standings`;
    return {content:`**${title}**`,embeds:[{
      title:view.startsWith('division')?'All 32 teams by division':'All 32 teams by conference',
      color:0x4f8cff,
      fields:[...groups.keys()].sort().map(key=>({
        name:key,
        value:sortStandings(groups.get(key)).map((item,index)=>standingLine(model,item,index)).join('\n'),
        inline:view.startsWith('division')
      }))
    }]};
  }
  return lines(`${c.league.name} · ${title}`,sortStandings(standings).slice(0,32).map((item,index)=>standingLine(model,item,index)));
}

function playoffLine(model,item,index){
  const team=standingTeam(model,item),seed=playoffSeed(item)??index+1;
  const status=seed<=7?'Playoff Seed':'In the Hunt';
  return `${seed}. **${team?.displayName||item.teamName||item.teamId}** (${team?.abbreviation||'—'}) · ${record(item.wins,item.losses,item.ties)} · ${status}`;
}

export async function playoffsCommand(c,values={}){
  const model=await discordLeagueReadModel(c,{domains:['teams','standings']});
  let standings=model.standings.length?model.standings:model.teams.map(team=>({
    teamId:team.id,teamName:team.displayName,wins:team.record?.wins,losses:team.record?.losses,
    ties:team.record?.ties,conference:team.conferenceName,division:team.divisionName,rank:null,seed:null
  }));
  const requested=lower(values.conference).replace(/^conference(?:\s+|:)/,'').trim();
  const groups=new Map();
  for(const item of standings){
    const conference=standingConference(model,item)||'Unassigned';
    if(requested&&requested!=='all'&&lower(conference)!==requested)continue;
    if(!groups.has(conference))groups.set(conference,[]);
    groups.get(conference).push(item);
  }
  const fields=[...groups.keys()].sort().map(conference=>({
    name:`${conference} Playoff Hunt`,
    value:sortStandings(groups.get(conference),{preferSeed:true}).slice(0,10)
      .map((item,index)=>playoffLine(model,item,index)).join('\n')||'No standings are available.',
    inline:false
  }));
  return {
    content:`**${c.league.name} · Playoff Hunt**`,
    embeds:[{title:requested&&requested!=='all'?`${[...groups.keys()][0]||clean(values.conference)} Top 10`:'Top 10 by conference',
      description:'Seeds 1–7 are currently in the playoff field. Seeds 8–10 are In the Hunt.',color:0x4f8cff,fields}]
  };
}

function gamePlayed(game){
  const status=lower(game.status);
  if(/scheduled|pregame|not.?started|unplayed|pending/.test(status)||status==='1')return false;
  if(/final|complete|played/.test(status))return true;
  return number(game.homeScore)!==null&&number(game.awayScore)!==null
    &&(number(game.homeScore)!==0||number(game.awayScore)!==0);
}

function canonicalGameStage(value){
  const stage=lower(value);
  if(stage.includes('pre'))return'preseason';
  if(stage.includes('post')||stage.includes('play')||stage.includes('pro'))return'playoffs';
  return'regular-season';
}

function standingRecords(model){
  const records=new Map();
  for(const item of model.standings||[]){
    const team=standingTeam(model,item);
    if(team)records.set(team.teamKey,record(item.wins,item.losses,item.ties));
  }
  return records;
}

function scheduledTeamLabel(teams,teamId,records,statuses){
  const team=resolveTeam(teams,teamId),name=team?.abbreviation||team?.displayName||clean(teamId)||'Unknown';
  const current=team&&records?.get(team.teamKey);
  if(!statuses)return current?`${name} (${current})`:name;
  const status=team&&statuses?.get(team.teamKey)||'alive';
  const indicator=status==='clinched'?'🟢':status==='eliminated'?'🔴':'⚪';
  return `${indicator} ${current?`${name} (${current})`:name}`;
}

function gameLine(teams,game,{includeWeek=false,records=null,statuses=null,plain=false}={}){
  const away=scheduledTeamLabel(teams,game.awayTeamId,records,statuses),home=scheduledTeamLabel(teams,game.homeTeamId,records,statuses);
  const prefix=includeWeek?`W${game.week} · `:'';
  const matchup=gamePlayed(game)
    ?`${away} ${game.awayScore??'—'} @ ${home} ${game.homeScore??'—'}`
    :`${away} @ ${home}${game.scheduledAt?` · ${game.scheduledAt}`:''}`;
  return `${prefix}${plain?matchup:`**${matchup}**`}`;
}

export async function scheduleCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','games','standings']});
  const records=standingRecords(model),statuses=playoffStatusByTeam(model);
  const currentWeek=number(model.snapshot.week_index)??number(c.league.current_week)??1;
  let view=clean(values.view);
  if(!view&&values.scope)view=lower(values.scope)==='week'?`week:${number(values.week)??currentWeek}`:'season';
  view=view||`week:${currentWeek}`;
  let week=null,requestedTeam='';
  if(/^week:\d+$/i.test(view))week=number(view.split(':')[1]);
  else if(/^week\s*\d+$/i.test(view))week=number(view.match(/\d+/)?.[0]);
  else if(view.startsWith('team:'))requestedTeam=view.slice('team:'.length);
  else if(view!=='season')requestedTeam=view;
  let games=model.games.filter(game=>week===null||number(game.week)===week);
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
      return `Week ${value} · ${weekGames.length} games · ${played} played · ${weekGames.length-played} unplayed`;
    });
    return lines(`${c.league.name} · Season Schedule`,[
      ...weekRows,
      `Full schedule: [Open ${c.league.name} Schedule](https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#schedule)`
    ]);
  }
  const selectedTeam=requestedTeam?resolveTeam(model.teams,requestedTeam):null;
  const heading=`${c.league.name} · ${selectedTeam?`${selectedTeam.displayName} Schedule`:week===null?'Season Schedule':`Week ${week}`}`;
  return truncate([heading,...(games.length?games.slice(0,40).map(game=>gameLine(model.teams,game,{includeWeek:true,records,statuses,plain:true})):[
    'No matching records were found.'
  ])].join('\n'));
}

export async function gamesCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','games']});
  const context=await currentFranchiseContext(c.db,c.league.id);
  const status=lower(values.status)||'all';
  const currentPeriod=model.games.filter(game=>{
    const sameSeason=number(game.season)===null||number(context.seasonYear)===null||number(game.season)===number(context.seasonYear);
    return sameSeason&&number(game.week)===number(context.week);
  });
  const stageRank={preseason:1,'regular-season':2,playoffs:3};
  const activeStage=currentPeriod.map(game=>canonicalGameStage(game.stage)).sort((a,b)=>stageRank[b]-stageRank[a])[0]||context.stage;
  const games=currentPeriod.filter(game=>canonicalGameStage(game.stage)===activeStage)
    .sort((a,b)=>clean(a.scheduledAt).localeCompare(clean(b.scheduledAt))||clean(a.id).localeCompare(clean(b.id)));
  const played=games.filter(gamePlayed),unplayed=games.filter(game=>!gamePlayed(game));
  const items=[];
  if(status!=='unplayed'){
    items.push(`__Played (${played.length})__`);
    items.push(...(played.length?played.map(game=>`✅ ${gameLine(model.teams,game)}`):['No games have finished yet.']));
  }
  if(status!=='played'){
    items.push(`__Unplayed (${unplayed.length})__`);
    items.push(...(unplayed.length?unplayed.map(game=>`⏳ ${gameLine(model.teams,game)}`):['Every scheduled game is complete.']));
  }
  const stage=activeStage==='preseason'?'Preseason':activeStage==='playoffs'?'Postseason':'Regular Season';
  return lines(`${c.league.name} · ${stage} Week ${context.week} Games`,items,'No games are scheduled for the active week.');
}

const REGULAR_SEASON_GAME_COUNT=17;

function playoffRecordRows(model){
  return (model.standings||[]).map(standing=>{
    const team=standingTeam(model,standing);
    if(!team)return null;
    const wins=number(standing.wins)??number(team.record?.wins)??0;
    const losses=number(standing.losses)??number(team.record?.losses)??0;
    const ties=number(standing.ties)??number(team.record?.ties)??0;
    const gamesPlayed=Math.max(0,wins+losses+ties);
    const remaining=Math.max(0,REGULAR_SEASON_GAME_COUNT-gamesPlayed);
    const maxWins=wins+remaining;
    return {
      team,wins,losses,ties,maxWins,
      currentPoints:wins+(ties*.5),
      maxPoints:maxWins+(ties*.5),
      conference:clean(standingConference(model,standing)||team.conferenceName),
      division:clean(standingDivision(model,standing)||team.divisionName)
    };
  }).filter(Boolean);
}

function eliminationRows(model){
  const rows=playoffRecordRows(model);
  return rows.filter(row=>{
    if(!row.conference||!row.division)return false;
    const conferenceRows=rows.filter(other=>other.conference===row.conference&&other!==row);
    const divisionRows=conferenceRows.filter(other=>other.division===row.division);
    const divisionPathOpen=!divisionRows.some(other=>other.currentPoints>row.maxPoints);
    const teamsAlreadyAboveCeiling=conferenceRows.filter(other=>other.currentPoints>row.maxPoints);
    const possibleDivisionWinners=new Set(teamsAlreadyAboveCeiling.map(other=>other.division).filter(Boolean)).size;
    const unavoidableWildCardTeams=Math.max(0,teamsAlreadyAboveCeiling.length-possibleDivisionWinners);
    const wildCardPathOpen=unavoidableWildCardTeams<3;
    return !divisionPathOpen&&!wildCardPathOpen;
  }).sort((a,b)=>a.conference.localeCompare(b.conference)||a.maxPoints-b.maxPoints||a.team.displayName.localeCompare(b.team.displayName));
}

function clinchedRows(model){
  const rows=playoffRecordRows(model);
  return rows.filter(row=>{
    if(!row.conference||!row.division)return false;
    const conferenceRows=rows.filter(other=>other.conference===row.conference&&other!==row);
    const divisionRows=conferenceRows.filter(other=>other.division===row.division);
    const divisionTitleClinched=divisionRows.every(other=>other.maxPoints<row.currentPoints);
    const possibleRecordThreats=conferenceRows.filter(other=>other.maxPoints>=row.currentPoints);
    const possibleDivisionWinners=new Set(possibleRecordThreats.map(other=>other.division).filter(Boolean)).size;
    const possibleWildCardThreats=Math.max(0,possibleRecordThreats.length-possibleDivisionWinners);
    return divisionTitleClinched||possibleWildCardThreats<3;
  });
}

function playoffStatusByTeam(model){
  const statuses=new Map();
  for(const row of eliminationRows(model))statuses.set(row.team.teamKey,'eliminated');
  for(const row of clinchedRows(model))statuses.set(row.team.teamKey,'clinched');
  return statuses;
}

export async function eliminatedCommand(c){
  const model=await discordLeagueReadModel(c,{domains:['teams','standings']});
  const eliminated=eliminationRows(model);
  if(!eliminated.length)return lines(`${c.league.name} · Mathematically Eliminated`,[],
    'No teams are mathematically eliminated by record yet.');
  const conferences=[...new Set(eliminated.map(item=>item.conference))];
  return {
    content:`**${c.league.name} · Mathematically Eliminated (${eliminated.length})**`,
    embeds:[{
      title:'Eliminated from Playoff Contention',color:0xef4444,
      description:'A team appears only when its best possible 17-game record can no longer reach either its division title or one of the three Wild Card positions. A tied record ceiling remains alive because FranchiseHQ does not infer unavailable Madden tiebreakers.',
      fields:conferences.map(conference=>({
        name:conference,
        value:eliminated.filter(item=>item.conference===conference).map(item=>
          `**${item.team.displayName} (${item.team.abbreviation||'—'})** · ${record(item.wins,item.losses,item.ties)} · best ${record(item.maxWins,item.losses,item.ties)}`
        ).join('\n'),
        inline:false
      })),
      footer:{text:'Record-only mathematical elimination · 17-game regular season'}
    }]
  };
}

function embedColor(value){const hex=clean(value).replace(/^#/,'');return /^[0-9a-f]{6}$/i.test(hex)?Number.parseInt(hex,16):0x4f8cff}

export async function playerCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','players','statistics']});
  const query=clean(values.name),allMatches=playerSearchMatches(model,query),matches=allMatches.slice(0,6);
  if(!matches.length)return lines(`${c.league.name} · Player Search`,[]);
  const exact=matches.length===1&&playerIsExact(matches[0],query);
  const shown=exact?matches.slice(0,1):matches;
  return {
    content:`**${c.league.name} · Player Search** · ${allMatches.length} match${allMatches.length===1?'':'es'}${allMatches.length>shown.length?` · first ${shown.length} shown`:''}`,
    embeds:shown.map(player=>playerStatEmbed(c,model,player))
  };
}

const METRIC_DEFINITIONS={
  passing:[
    ['passYds','Pass Yds','sum'],['passTDs','Pass TDs','sum'],['passInts','INTs','sum'],
    ['passComp','Completions','sum'],['passAtt','Attempts','sum'],['passCompPct','Comp %','derived'],
    ['passYdsPerAtt','Yds / Attempt','derived'],['passYdsPerGame','Pass Yds / Game','derived'],['passerRating','Passer Rating','derived'],
    ['passSacks','Sacks Taken','sum'],['passLongest','Long','max'],['passPts','Fantasy Pts','sum']
  ],
  rushing:[
    ['rushYds','Rush Yds','sum'],['rushTDs','Rushing TDs','sum'],['rushFum','Fumbles','sum'],
    ['rushAtt','Carries','sum'],['rushYdsPerAtt','Yds / Carry','derived'],['rushYdsPerGame','Rush Yds / Game','derived'],
    ['rushToPct','Rush Share %','average'],['rush20PlusYds','20+ Runs','sum'],
    ['rushBrokenTackles','Broken Tackles','sum'],['rushYdsAfterContact','Yds After Contact','sum'],
    ['rushLongest','Long','max'],['rushPts','Fantasy Pts','sum']
  ],
  receiving:[
    ['recCatches','Receptions','sum'],['recYds','Rec Yds','sum'],['recTDs','Rec TDs','sum'],
    ['recYdsPerCatch','Yds / Catch','derived'],['recYdsPerGame','Rec Yds / Game','derived'],
    ['recCatchPct','Catch %','average'],['recToPct','Target Share %','average'],
    ['recDrops','Drops','sum'],['recYdsAfterCatch','YAC','sum'],
    ['recYacPerCatch','YAC / Catch','derived'],['recLongest','Long','max'],['recPts','Fantasy Pts','sum']
  ],
  defense:[
    ['defTotalTackles','Tackles','sum'],['defSacks','Sacks','sum'],['defInts','INTs','sum'],
    ['defForcedFum','Forced Fumbles','sum'],['defFumRec','Fumble Recoveries','sum'],
    ['defTDs','Defensive TDs','sum'],['defDeflections','Pass Deflections','sum'],
    ['defIntReturnYds','INT Return Yds','sum'],['defSafeties','Safeties','sum'],
    ['defCatchAllowed','Catches Allowed','sum'],['defPts','Fantasy Pts','sum']
  ],
  kicking:[
    ['kickPts','Kicking Points','sum'],['fGMade','FG Made','sum'],['fGAtt','FG Attempts','sum'],
    ['fGCompPct','FG %','derived'],['fG50PlusMade','50+ Made','sum'],['fG50PlusAtt','50+ Attempts','sum'],
    ['fGLongest','FG Long','max'],['xPMade','XP Made','sum'],['xPAtt','XP Attempts','sum'],
    ['xPCompPct','XP %','derived'],['kickoffAtt','Kickoffs','sum'],['kickoffTBs','Touchbacks','sum']
  ],
  punting:[
    ['puntAtt','Punts','sum'],['puntYds','Punt Yds','sum'],['puntYdsPerAtt','Yds / Punt','derived'],
    ['puntNetYds','Net Punt Yds','sum'],['puntNetYdsPerAtt','Net Yds / Punt','derived'],
    ['puntsIn20','Inside 20','sum'],['puntTBs','Touchbacks','sum'],['puntsBlocked','Blocked','sum'],
    ['puntLongest','Long','max']
  ]
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
  const totals={},averageCounts={};
  for(const stat of stats){
    const metrics=stat?.metrics&&typeof stat.metrics==='object'?stat.metrics:{};
    for(const [key,,mode] of definitions){
      if(!['sum','max','average'].includes(mode)||!Number.isFinite(Number(metrics[key])))continue;
      totals[key]=mode==='max'?Math.max(Number(totals[key]||0),Number(metrics[key])):Number(totals[key]||0)+Number(metrics[key]);
      if(mode==='average')averageCounts[key]=Number(averageCounts[key]||0)+1;
    }
  }
  for(const [key,count] of Object.entries(averageCounts))totals[key]=totals[key]/count;
  const metricRows=key=>stats.filter(stat=>Number.isFinite(Number(stat?.metrics?.[key]))).length;
  if(category==='passing'){
    totals.passCompPct=totals.passAtt?totals.passComp/totals.passAtt*100:null;
    totals.passYdsPerAtt=totals.passAtt?totals.passYds/totals.passAtt:null;
    totals.passYdsPerGame=metricRows('passYds')?totals.passYds/metricRows('passYds'):null;
    totals.passerRating=passerRating(totals);
  }else if(category==='rushing'){
    totals.rushYdsPerAtt=totals.rushAtt?totals.rushYds/totals.rushAtt:null;
    totals.rushYdsPerGame=metricRows('rushYds')?totals.rushYds/metricRows('rushYds'):null;
  }
  else if(category==='receiving'){
    totals.recYdsPerCatch=totals.recCatches?totals.recYds/totals.recCatches:null;
    totals.recYdsPerGame=metricRows('recYds')?totals.recYds/metricRows('recYds'):null;
    totals.recYacPerCatch=totals.recCatches?totals.recYdsAfterCatch/totals.recCatches:null;
  }else if(category==='kicking'){
    totals.fGCompPct=totals.fGAtt?totals.fGMade/totals.fGAtt*100:null;
    totals.xPCompPct=totals.xPAtt?totals.xPMade/totals.xPAtt*100:null;
  }else if(category==='punting'){
    totals.puntYdsPerAtt=totals.puntAtt?totals.puntYds/totals.puntAtt:null;
    totals.puntNetYdsPerAtt=totals.puntAtt?totals.puntNetYds/totals.puntAtt:null;
  }
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

function formatLabeledMetric(label,value){
  const formatted=formatMetric(value);
  return label.includes('%')?`${formatted}%`:formatted;
}

function meaningfulStats(stats,snapshot){
  return stats.filter(stat=>{
    const provenance=lower(`${stat.stage||''} ${stat.source?.routePath||''}`);
    return !provenance.includes('preseason')&&!/\/week\/pre(?:\/|$)/.test(provenance);
  }).map(stat=>({
    ...stat,season:Number(stat.season??stat.seasonYear??snapshot?.season_year)||Number(snapshot?.season_year)||null
  }));
}

function playerIsExact(player,query){
  const wanted=lower(query);
  return [player?.displayName,player?.publicId,player?.id].some(value=>lower(value)===wanted);
}

function playerSearchMatches(model,query){
  const wanted=lower(query);
  if(!wanted)return[];
  return model.players.filter(player=>[
    player.displayName,player.publicId,player.id
  ].some(value=>lower(value).includes(wanted))).sort((a,b)=>{
    const exactDifference=Number(playerIsExact(b,query))-Number(playerIsExact(a,query));
    if(exactDifference)return exactDifference;
    const prefixDifference=Number(lower(b.displayName).startsWith(wanted))-Number(lower(a.displayName).startsWith(wanted));
    return prefixDifference||lower(a.displayName).localeCompare(lower(b.displayName));
  });
}

const DEFENSE_POSITIONS=new Set(['REDGE','LEDGE','EDGE','DE','DT','NT','SAM','MIKE','WILL','LB','CB','FS','SS','S']);

const PLAYER_CARD_METRICS=Object.freeze({
  QB:{category:'passing',metrics:[
    ['passCompPct','Completion Percentage','percent'],['passYds','Yards'],['passTDs','TDs'],['passInts','INTs']
  ]},
  RB:{category:'rushing',metrics:[
    ['rushAtt','Attempts'],['rushYds','Yards'],['rushTDs','TDs'],['rushFum','Fumbles']
  ]},
  RECEIVER:{category:'receiving',metrics:[
    ['recCatches','Receptions'],['recYds','Yards'],['recTDs','TDs']
  ]},
  DEFENSE:{category:'defense',metrics:[
    ['defTotalTackles','Tackles'],['defSacks','Sacks'],['defInts','INTs']
  ]},
  K:{category:'kicking',metrics:[
    ['fGAtt','FG Attempted'],['fGMade','FG Made']
  ]}
});

function playerCardMetricDefinition(player){
  const position=clean(player?.position).toUpperCase();
  if(position==='QB')return PLAYER_CARD_METRICS.QB;
  if(['HB','RB','FB'].includes(position))return PLAYER_CARD_METRICS.RB;
  if(['WR','TE'].includes(position))return PLAYER_CARD_METRICS.RECEIVER;
  if(DEFENSE_POSITIONS.has(position))return PLAYER_CARD_METRICS.DEFENSE;
  if(position==='K')return PLAYER_CARD_METRICS.K;
  return null;
}

function playerHref(c,player){
  return `https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#players/${encodeURIComponent(player.publicId||player.id)}`;
}

function playerPortraitUrl(player={}){
  const source=player.source||{};
  const candidates=[player.imageUrl,source.imageUrl,source.headshotUrl,source.portraitUrl,player.portraitId,source.portraitId]
    .map(clean).filter(Boolean);
  for(const candidate of candidates){
    if(/^https:\/\//i.test(candidate))return candidate;
    if(/^\d+$/.test(candidate))return `https://ratings-images-prod.pulse.ea.com/madden-nfl-26/portraits/${candidate}.png`;
  }
  return null;
}

function playerStatEmbed(c,model,player){
  const team=resolveTeam(model.teams,player.teamId),href=playerHref(c,player),portrait=playerPortraitUrl(player);
  const stats=meaningfulStats(model.statistics.filter(stat=>String(stat.playerId)===String(player.id)),model.snapshot);
  const seasons=[...new Set(stats.map(stat=>stat.season).filter(Boolean))].sort((a,b)=>a-b);
  const definition=playerCardMetricDefinition(player);
  const fields=[
    {name:'Overall',value:String(player.overall??'—'),inline:true},
    {name:'Age',value:String(player.age??'—'),inline:true},
    {name:'Development',value:clean(player.devTrait)||'Normal',inline:true}
  ];
  for(const season of seasons){
    if(!definition)break;
    const totals=aggregateCategory(stats.filter(stat=>stat.season===season&&lower(stat.category)===definition.category),definition.category);
    const entries=definition.metrics.filter(([key])=>totals[key]!==null&&totals[key]!==undefined&&Number.isFinite(Number(totals[key])));
    if(!entries.length)continue;
    fields.push({
      name:`${season} · Major Statistics`,
      value:entries.map(([key,label,mode])=>`**${label}:** ${mode==='percent'?`${formatMetric(totals[key])}%`:formatMetric(totals[key])}`).join(' · '),
      inline:false
    });
  }
  if(fields.length===3)fields.push({name:`${model.snapshot.season_year||'Current'} Statistics`,value:'No major position statistics are available.',inline:false});
  return {
    title:player.displayName,url:href,color:embedColor(team?.primaryColor),
    description:`${team?.displayName||'Team unavailable'} · ${player.position||'Position unavailable'}`,
    ...(portrait?{thumbnail:{url:portrait}}:{}),
    fields:fields.slice(0,25),
    footer:{text:`${c.league.name} · Major position statistics`}
  };
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

const TEAM_SUM_METRICS=Object.freeze([
  'off1stDowns','off2PtAtt','off2PtConv','off3rdDownAtt','off3rdDownConv','off4thDownAtt','off4thDownConv',
  'offFumLost','offIntsLost','offPassTDs','offPassYds','offRedZoneFGs','offRedZoneTDs','offRedZones',
  'offRushTDs','offRushYds','offSacks','offTotalYds','offTotalYdsGained','penalties','penaltyYds',
  'defForcedFum','defFumRec','defIntsRec','defPassYds','defRedZoneFGs','defRedZoneTDs','defRedZones',
  'defRushYds','defSacks','defTotalYds','tOGiveaways','tOTakeaways'
]);

const TEAM_METRIC_GROUPS=Object.freeze([
  ['Scoring',[
    ['gamesPlayed','Games'],['pointsFor','Points For'],['pointsAgainst','Points Against'],
    ['pointsPerGame','Points / Game'],['pointsAllowedPerGame','Allowed / Game']
  ]],
  ['Offense',[
    ['totalOffense','Total Yds'],['offPassYds','Pass Yds'],['offPassTDs','Pass TDs'],
    ['offRushYds','Rush Yds'],['offRushTDs','Rush TDs'],['off1stDowns','First Downs'],['offSacks','Sacks Allowed']
  ]],
  ['Downs & Red Zone',[
    ['off3rdDownConv','3rd Down Made'],['off3rdDownAtt','3rd Down Att'],['off3rdDownPct','3rd Down %'],
    ['off4thDownConv','4th Down Made'],['off4thDownAtt','4th Down Att'],['off4thDownPct','4th Down %'],
    ['offRedZones','Red Zone Trips'],['offRedZoneTDs','Red Zone TDs'],['offRedZoneFGs','Red Zone FGs'],
    ['offRedZonePct','Red Zone Score %'],['off2PtConv','2PT Made'],['off2PtAtt','2PT Att'],['off2PtConvPct','2PT %']
  ]],
  ['Defense',[
    ['defTotalYds','Yds Allowed'],['defPassYds','Pass Yds Allowed'],['defRushYds','Rush Yds Allowed'],
    ['defSacks','Sacks'],['defIntsRec','INTs'],['defForcedFum','Forced Fumbles'],['defFumRec','Fumble Recoveries'],
    ['defRedZones','Red Zone Trips Allowed'],['defRedZoneTDs','Red Zone TDs Allowed'],['defRedZoneFGs','Red Zone FGs Allowed'],
    ['defRedZonePct','Red Zone Score % Allowed']
  ]],
  ['Possession & Discipline',[
    ['tOGiveaways','Giveaways'],['offIntsLost','INTs Thrown'],['offFumLost','Fumbles Lost'],
    ['tOTakeaways','Takeaways'],['turnoverDifferential','Turnover Differential'],
    ['penalties','Penalties'],['penaltyYds','Penalty Yds']
  ]]
]);

function ratio(numerator,denominator,multiplier=100){
  return Number(denominator)>0?Number(numerator||0)/Number(denominator)*multiplier:null;
}

function aggregateTeamMetrics(stats,games,team,teams,activeSeason=null){
  const totals={};
  for(const stat of stats){
    const metrics=stat?.metrics&&typeof stat.metrics==='object'?stat.metrics:{};
    for(const key of TEAM_SUM_METRICS){
      if(!Object.prototype.hasOwnProperty.call(metrics,key)||!Number.isFinite(Number(metrics[key])))continue;
      totals[key]=Number(totals[key]||0)+Number(metrics[key]);
    }
  }
  if(Object.prototype.hasOwnProperty.call(totals,'offTotalYdsGained')||Object.prototype.hasOwnProperty.call(totals,'offTotalYds')){
    totals.totalOffense=totals.offTotalYdsGained??totals.offTotalYds;
  }
  const completed=games.filter(game=>gamePlayed(game)&&canonicalGameStage(game.stage)!=='preseason'
    &&(number(game.season)===null||activeSeason===null||number(game.season)===activeSeason)
    &&[game.homeTeamId,game.awayTeamId].some(id=>resolveTeam(teams,id)?.teamKey===team.teamKey));
  if(completed.length){
    totals.gamesPlayed=completed.length;totals.pointsFor=0;totals.pointsAgainst=0;
    for(const game of completed){
      const home=resolveTeam(teams,game.homeTeamId)?.teamKey===team.teamKey;
      totals.pointsFor+=Number(home?game.homeScore:game.awayScore)||0;
      totals.pointsAgainst+=Number(home?game.awayScore:game.homeScore)||0;
    }
    totals.pointsPerGame=totals.pointsFor/completed.length;
    totals.pointsAllowedPerGame=totals.pointsAgainst/completed.length;
  }
  const derived=[
    ['off3rdDownPct','off3rdDownConv','off3rdDownAtt'],['off4thDownPct','off4thDownConv','off4thDownAtt'],
    ['off2PtConvPct','off2PtConv','off2PtAtt']
  ];
  for(const [target,numerator,denominator] of derived){
    const value=ratio(totals[numerator],totals[denominator]);if(value!==null)totals[target]=value;
  }
  const redZonePct=ratio(Number(totals.offRedZoneTDs||0)+Number(totals.offRedZoneFGs||0),totals.offRedZones);
  if(redZonePct!==null)totals.offRedZonePct=redZonePct;
  const defensiveRedZonePct=ratio(Number(totals.defRedZoneTDs||0)+Number(totals.defRedZoneFGs||0),totals.defRedZones);
  if(defensiveRedZonePct!==null)totals.defRedZonePct=defensiveRedZonePct;
  if(!Object.prototype.hasOwnProperty.call(totals,'tOGiveaways')&&(totals.offIntsLost!==undefined||totals.offFumLost!==undefined)){
    totals.tOGiveaways=Number(totals.offIntsLost||0)+Number(totals.offFumLost||0);
  }
  if(!Object.prototype.hasOwnProperty.call(totals,'tOTakeaways')&&(totals.defIntsRec!==undefined||totals.defFumRec!==undefined)){
    totals.tOTakeaways=Number(totals.defIntsRec||0)+Number(totals.defFumRec||0);
  }
  if(totals.tOGiveaways!==undefined||totals.tOTakeaways!==undefined){
    totals.turnoverDifferential=Number(totals.tOTakeaways||0)-Number(totals.tOGiveaways||0);
  }
  return totals;
}

function teamMetricFields(totals){
  return TEAM_METRIC_GROUPS.map(([name,definitions])=>{
    const entries=definitions.filter(([key])=>totals[key]!==undefined&&totals[key]!==null&&Number.isFinite(Number(totals[key])));
    return entries.length?{name,value:entries.map(([key,label])=>`**${label}:** ${formatLabeledMetric(label,totals[key])}`).join(' · '),inline:false}:null;
  }).filter(Boolean);
}

export async function teamStatsCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','statistics','games','standings']});
  const team=resolveTeam(model.teams,values.team||values.name);
  if(!team)throw Object.assign(new Error('That team was not found in the active league.'),{status:404});
  const activeSeason=number(model.snapshot.season_year);
  const stats=meaningfulStats(model.statistics.filter(stat=>lower(stat.category)==='team-game'
    &&resolveTeam(model.teams,stat.teamId)?.teamKey===team.teamKey
    &&(number(stat.season)===null||activeSeason===null||number(stat.season)===activeSeason)),model.snapshot);
  const totals=aggregateTeamMetrics(stats,model.games,team,model.teams,activeSeason),href=`https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#teams/${encodeURIComponent(team.teamKey)}`;
  const standing=model.standings.find(item=>standingTeam(model,item)?.teamKey===team.teamKey);
  const fields=teamMetricFields(totals);
  if(!fields.length)fields.push({name:'Statistics',value:'No completed-game team statistics are available.',inline:false});
  return {content:`[Open ${team.displayName} in FranchiseHQ](${href})`,embeds:[{
    title:`${team.displayName} Team Statistics`,url:href,color:embedColor(team.primaryColor),
    description:[`${model.snapshot.season_year||'Current'} Franchise season`,standing?record(standing.wins,standing.losses,standing.ties):null].filter(Boolean).join(' · '),
    fields,footer:{text:`${c.league.name} · Source-backed team-game totals and derived rates`}
  }]};
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
  const model=await discordLeagueReadModel(c,{domains:['teams','players']});
  const playerByKey=new Map();
  for(const player of model.players){
    for(const key of [player.publicId,player.id,player.sourcePlayerId]){
      if(key!==null&&key!==undefined&&String(key))playerByKey.set(String(key),player);
    }
  }
  const aliases=await rows(c.db,`SELECT player_identity_id AS playerIdentityId,source_player_id AS sourcePlayerId
    FROM player_source_aliases WHERE league_id=? ORDER BY updated_at DESC`,c.league.id);
  const sourceByIdentity=new Map();
  for(const alias of aliases){
    const identityId=String(alias.playerIdentityId||'');
    if(identityId&&!sourceByIdentity.has(identityId))sourceByIdentity.set(identityId,String(alias.sourcePlayerId||''));
  }
  const listedPlayer=item=>playerByKey.get(String(item.playerPublicId||''))
    ||playerByKey.get(sourceByIdentity.get(String(item.playerIdentityId||'')))
    ||playerByKey.get(String(item.playerIdentityId||''));
  if(position)listings=listings.filter(item=>lower(listedPlayer(item)?.position).includes(position));
  const needs=new Map(state.teamNeeds.map(item=>[item.teamKey,item.needs]));
  if(!listings.length)return lines(`${c.league.name} · Trade Block`,[],'No matching players are currently listed.');
  const shown=listings.slice(0,10);
  const embeds=shown.map(item=>{
    const player=listedPlayer(item);
    const looking=item.requestedReturn||needs.get(item.teamKey)?.join(', ')||'Open to offers';
    if(player){
      const team=resolveTeam(model.teams,player.teamId),portrait=playerPortraitUrl(player);
      return {
        title:player.displayName,url:playerHref(c,player),color:embedColor(team?.primaryColor),
        description:`${team?.displayName||'Team unavailable'} · ${player.position||'Position unavailable'}`,
        ...(portrait?{thumbnail:{url:portrait}}:{}),
        fields:[
          {name:'Overall',value:String(player.overall??'—'),inline:true},
          {name:'Age',value:String(player.age??'—'),inline:true},
          {name:'Development',value:clean(player.devTrait)||'Normal',inline:true},
          {name:'Looking For',value:truncate(looking,1000),inline:false}
        ],
        footer:{text:`${c.league.name} · Trade Block`}
      };
    }
    const team=resolveTeam(model.teams,item.teamKey)||resolveTeam(state.teams,item.teamKey);
    return {
      title:item.playerName||item.draftPickId||'Trade asset',
      color:embedColor(team?.primaryColor),
      description:team?.displayName||teamName(state.teams,item.teamKey),
      fields:[{name:'Looking For',value:truncate(looking,1000),inline:false}],
      footer:{text:`${c.league.name} · Trade Block`}
    };
  });
  return {
    content:`**${c.league.name} · Trade Block** · ${listings.length} listed${listings.length>shown.length?` · first ${shown.length} shown`:''} · [Open Trade Block](https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#trade-block)`,
    embeds
  };
}

export async function tradeHistoryCommand(c){
  const result=await rows(c.db,`SELECT workflow.id,workflow.approved_at AS approvedAt,
      group_concat(participant.team_key, ' ↔ ') AS teams
    FROM trade_workflows workflow
    INNER JOIN trade_workflow_participants participant ON participant.trade_id=workflow.id AND participant.league_id=workflow.league_id
    WHERE workflow.league_id=? AND workflow.status='approved'
      AND NOT EXISTS (SELECT 1 FROM trade_management_events event
        WHERE event.league_id=workflow.league_id AND event.event_type='trade-hidden' AND event.trade_id=workflow.id)
      AND NOT EXISTS (SELECT 1 FROM trade_management_events event
        WHERE event.league_id=workflow.league_id AND event.event_type='all-trades-hidden'
          AND workflow.created_at<=event.created_at)
    GROUP BY workflow.id,workflow.approved_at
    ORDER BY workflow.approved_at DESC,workflow.updated_at DESC LIMIT 20`,c.league.id);
  return lines(`${c.league.name} · Approved Trade History`,result.map(item=>
    `**[${item.teams||'League trade'}](https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#trade-center/${encodeURIComponent(item.id)})** · ${item.approvedAt||'Approved'}`
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
  return lines(`${c.league.name} · Twitch`,[],row.twitchUrl?`**[${row.displayName} on Twitch](${row.twitchUrl})**`:`${row.displayName} has not added a Twitch channel.`);
}

export async function confidenceViewCommand(c){
  const state=await competitionState(c);
  const picks=Object.values(state.confidence.entry.picks||{}).sort((a,b)=>a.week-b.week||clean(a.gameId).localeCompare(clean(b.gameId)));
  return lines(`${c.league.name} · Your Confidence Pool`,picks.map(pick=>
    `W${pick.week} · **${pick.gameId}** · ${pick.selectedTeamId||'No pick'} · Confidence ${pick.confidence??'—'}`
  ),'You have not saved any Confidence Pool picks.');
}
