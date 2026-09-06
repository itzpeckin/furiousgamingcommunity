import {
  activeSnapshotDomainPage,
  activeSnapshotRecord
} from '../api/leagues/[leagueSlug]/snapshot/read-model.js';
import { resolveTeam } from './league-teams.js';
import { tradeCenterState } from '../api/leagues/[leagueSlug]/trade-center.js';
import { competitionState } from '../api/leagues/[leagueSlug]/competition.js';
import { leagueNewsState } from './league-news.js';

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
    domain,await allDomain(c.db,c.league.id,snapshot.id,domain,{compact:domain==='statistics'})
  ]));
  return {snapshot,...Object.fromEntries(loaded)};
}

export async function standingsCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','standings']});
  let standings=model.standings.length?model.standings:model.teams.map(team=>({
    teamId:team.id,teamName:team.displayName,wins:team.record?.wins,losses:team.record?.losses,
    ties:team.record?.ties,conference:team.conference,division:team.division,rank:null,seed:null
  }));
  const scope=lower(values.scope)||'league',name=lower(values.name);
  if(scope==='conference'&&name)standings=standings.filter(item=>lower(item.conference).includes(name));
  if(scope==='division'&&name)standings=standings.filter(item=>lower(item.division).includes(name));
  if(scope==='team'&&name)standings=standings.filter(item=>{
    const team=resolveTeam(model.teams,item.teamId)||resolveTeam(model.teams,item.teamName);
    return [item.teamName,team?.displayName,team?.abbreviation].some(value=>lower(value).includes(name));
  });
  standings.sort((a,b)=>(number(a.rank)??999)-(number(b.rank)??999)||(b.wins||0)-(a.wins||0)||(a.losses||0)-(b.losses||0));
  const title=scope==='league'?'League Standings':`${values.name||scope} Standings`;
  return lines(`${c.league.name} · ${title}`,standings.slice(0,32).map((item,index)=>{
    const team=resolveTeam(model.teams,item.teamId)||resolveTeam(model.teams,item.teamName);
    return `${item.rank||index+1}. **${team?.abbreviation||item.teamName||item.teamId}** ${record(item.wins,item.losses,item.ties)}${item.seed?` · Seed ${item.seed}`:''}`;
  }));
}

function gamePlayed(game){
  return /final|complete|played/i.test(clean(game.status))||game.homeScore!==null&&game.awayScore!==null;
}

export async function scheduleCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','games']});
  const requestedWeek=number(values.week);
  const currentWeek=number(model.snapshot.week_index)??number(c.league.current_week)??1;
  const week=lower(values.scope)==='week'?(requestedWeek??currentWeek):null;
  const status=lower(values.status)||'all';
  const requestedTeam=clean(values.team);
  let games=model.games.filter(game=>week===null||number(game.week)===week);
  if(status==='played')games=games.filter(gamePlayed);
  if(status==='unplayed')games=games.filter(game=>!gamePlayed(game));
  if(requestedTeam){
    const team=resolveTeam(model.teams,requestedTeam);
    if(!team)throw Object.assign(new Error('That team was not found in the active league.'),{status:404});
    games=games.filter(game=>[game.homeTeamId,game.awayTeamId].some(id=>resolveTeam(model.teams,id)?.teamKey===team.teamKey));
  }
  games.sort((a,b)=>(a.week??0)-(b.week??0)||clean(a.scheduledAt).localeCompare(clean(b.scheduledAt)));
  if(week===null&&!requestedTeam){
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
  return lines(`${c.league.name} · ${week===null?'Season Schedule':`Week ${week}`}`,games.slice(0,40).map(game=>{
    const away=teamName(model.teams,game.awayTeamId),home=teamName(model.teams,game.homeTeamId);
    return gamePlayed(game)
      ?`W${game.week} · **${away} ${game.awayScore??'—'} @ ${home} ${game.homeScore??'—'}**`
      :`W${game.week} · **${away} @ ${home}**${game.scheduledAt?` · ${game.scheduledAt}`:''}`;
  }));
}

export async function playerCommand(c,values){
  const model=await discordLeagueReadModel(c,{domains:['teams','players']});
  const query=lower(values.name);
  const matches=model.players.filter(player=>[
    player.displayName,player.publicId,player.id
  ].some(value=>lower(value)===query)||lower(player.displayName).includes(query)).slice(0,8);
  const origin='https://franchisehq.app';
  return lines(`${c.league.name} · Player Search`,matches.map(player=>{
    const team=teamName(model.teams,player.teamId);
    const href=`${origin}/leagues/${encodeURIComponent(c.league.slug)}#players/${encodeURIComponent(player.publicId||player.id)}`;
    return `**${player.displayName}** · ${player.position||'—'} · ${player.overall??'—'} OVR · ${team}\n${href}`;
  }));
}

const METRIC_PREFERENCES={
  passing:['passYds','passingYards','passTDs','passingTouchdowns','passerRating','completions'],
  rushing:['rushYds','rushingYards','rushTDs','rushingTouchdowns','carries'],
  receiving:['recYds','receivingYards','recTDs','receivingTouchdowns','receptions'],
  defense:['tackles','tacklesForLoss','tfl','sacks','interceptions','forcedFumbles','fumbleRecoveries','defensiveTDs'],
  kicking:['fieldGoalsMade','fgMade','fieldGoalPct','extraPointsMade'],
  punting:['puntYards','punts','netPuntYards','puntsInside20']
};

function metricEntries(stat,category){
  const metrics=stat?.metrics&&typeof stat.metrics==='object'?stat.metrics:{};
  const preferred=METRIC_PREFERENCES[category]||[];
  const keys=[...preferred,...Object.keys(metrics)].filter((key,index,all)=>all.indexOf(key)===index)
    .filter(key=>!key.startsWith('__')&&metrics[key]!==null&&metrics[key]!==undefined&&metrics[key]!=='');
  return keys.slice(0,7).map(key=>[key,metrics[key]]);
}

function metricLabel(value){
  return clean(value).replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/\b\w/g,letter=>letter.toUpperCase());
}

function primaryMetric(stat,category){
  const entries=metricEntries(stat,category);
  const numeric=entries.find(([,value])=>Number.isFinite(Number(value)));
  return numeric?Number(numeric[1]):-Infinity;
}

export async function statsCommand(c,values,{leaders=false}={}){
  const model=await discordLeagueReadModel(c,{domains:['teams','players','statistics']});
  const category=lower(values.category)||'passing';
  const week=number(values.week);
  let stats=model.statistics.filter(stat=>(!category||lower(stat.category)===category)&&(week===null||number(stat.week)===week));
  const playerMap=new Map(model.players.map(player=>[String(player.id),player]));
  if(leaders){
    stats.sort((a,b)=>primaryMetric(b,category)-primaryMetric(a,category));
    return lines(`${c.league.name} · ${metricLabel(category)} Leaders`,stats.slice(0,10).map((stat,index)=>{
      const player=playerMap.get(String(stat.playerId));
      const metric=metricEntries(stat,category)[0]||['Value','—'];
      return `${index+1}. **${player?.displayName||stat.playerId||teamName(model.teams,stat.teamId)}** · ${metricLabel(metric[0])}: ${metric[1]}`;
    }));
  }
  const query=lower(values.name),target=lower(values.target)||'player';
  if(target==='player'){
    const ids=new Set(model.players.filter(player=>lower(player.displayName).includes(query)||[player.id,player.publicId].some(value=>lower(value)===query)).map(player=>String(player.id)));
    stats=stats.filter(stat=>ids.has(String(stat.playerId)));
  }else{
    const team=resolveTeam(model.teams,values.name);
    if(!team)throw Object.assign(new Error('That team was not found in the active league.'),{status:404});
    stats=stats.filter(stat=>resolveTeam(model.teams,stat.teamId)?.teamKey===team.teamKey);
    const totals={};
    for(const stat of stats)for(const [key,value] of metricEntries(stat,category)){
      if(Number.isFinite(Number(value)))totals[key]=(totals[key]||0)+Number(value);
    }
    const summary=Object.entries(totals).slice(0,12).map(([key,value])=>`${metricLabel(key)} ${Number.isInteger(value)?value:value.toFixed(1)}`).join(' · ');
    return lines(`${c.league.name} · ${team.displayName} ${metricLabel(category)} Stats`,[],summary||'No populated team metrics were found.');
  }
  return lines(`${c.league.name} · ${values.name} ${metricLabel(category)} Stats`,stats.slice(0,12).map(stat=>{
    const player=playerMap.get(String(stat.playerId));
    const metrics=metricEntries(stat,category).map(([key,value])=>`${metricLabel(key)} ${value}`).join(' · ');
    return `**${player?.displayName||teamName(model.teams,stat.teamId)}**${stat.week!=null?` · W${stat.week}`:''}\n${metrics||'No populated metrics.'}`;
  }));
}

export async function tradeBlockCommand(c,values){
  const state=await tradeCenterState(c);
  const teamQuery=lower(values.team),position=lower(values.position);
  let listings=state.listings;
  if(teamQuery)listings=listings.filter(item=>{
    const team=resolveTeam(state.teams,item.teamKey);
    return [item.teamKey,team?.displayName,team?.abbreviation].some(value=>lower(value).includes(teamQuery));
  });
  if(position){
    const model=await discordLeagueReadModel(c,{domains:['players']});
    const playerByPublicId=new Map(model.players.map(player=>[String(player.publicId||''),player]));
    listings=listings.filter(item=>lower(playerByPublicId.get(String(item.playerPublicId||''))?.position).includes(position));
  }
  const needs=new Map(state.teamNeeds.map(item=>[item.teamKey,item.needs]));
  return lines(`${c.league.name} · Trade Block`,listings.slice(0,25).map(item=>{
    const looking=item.requestedReturn||needs.get(item.teamKey)?.join(', ')||'Open to offers';
    return `**${item.playerName||item.draftPickId||'Trade asset'}** · ${teamName(state.teams,item.teamKey)}\nLooking for: ${looking}`;
  }));
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
  for(const category of rules.categories||[])for(const section of category.sections||[])for(const rule of section.rules||[]){
    const text=clean(rule.text||clean(rule.html).replace(/<[^>]*>/g,' '));
    const haystack=lower([category.title,section.title,rule.title,text].join(' '));
    if(!query||haystack.includes(query))found.push(`**${category.title} · ${section.title}${rule.title?` · ${rule.title}`:''}**\n${text}`);
  }
  return lines(`${c.league.name} · League Rules`,found.slice(0,15));
}

export async function gmHistoryCommand(c,values){
  const query=lower(values.name);
  const result=await rows(c.db,`SELECT identity.display_name AS displayName,identity.public_id AS publicId,
      COALESCE(SUM(summary.regular_wins),0) AS wins,COALESCE(SUM(summary.regular_losses),0) AS losses,
      COALESCE(SUM(summary.regular_ties),0) AS ties,COALESCE(SUM(summary.playoff_appearance),0) AS playoffs,
      COALESCE(SUM(summary.super_bowl_appearances),0) AS superBowls,
      COALESCE(SUM(summary.super_bowl_championships),0) AS championships
    FROM gm_identities identity
    LEFT JOIN gm_season_summaries summary ON summary.league_id=identity.league_id AND summary.gm_identity_id=identity.id
    WHERE identity.league_id=?
    GROUP BY identity.id,identity.display_name,identity.public_id
    ORDER BY championships DESC,wins DESC,displayName`,c.league.id);
  const filtered=query?result.filter(item=>lower(item.displayName).includes(query)||lower(item.publicId).includes(query)):result;
  return lines(`${c.league.name} · GM History`,filtered.slice(0,25).map((item,index)=>
    `${index+1}. **${item.displayName}** · ${record(item.wins,item.losses,item.ties)} · ${item.playoffs} playoffs · ${item.superBowls} Super Bowls · ${item.championships} titles`
  ));
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
