import { discordCommandName, discordFocusedOption } from './discord-commands.js';
import { activeLeagueTeams, activeTeamAssignments, canonicalTeamKey, resolveTeam } from './league-teams.js';
import { normalizePlayer } from '../api/leagues/[leagueSlug]/snapshot/read-model.js';

const clean=value=>String(value??'').trim();
const lower=value=>clean(value).toLowerCase();
const choice=(name,value)=>({name:clean(name).slice(0,100),value:clean(value).slice(0,100)});
const matches=(value,query)=>!query||lower(value).includes(query);
const uniqueChoices=items=>{
  const seen=new Set();
  return items.filter(item=>item?.name&&item?.value&&!seen.has(String(item.value))&&seen.add(String(item.value))).slice(0,25);
};

const METRICS={
  passing:[['Passing yards','passYds'],['Passing touchdowns','passTDs'],['Completions','passComp'],['Attempts','passAtt'],['Completion percentage','passCompPct'],['Interceptions thrown','passInts'],['Passer rating','passerRating']],
  rushing:[['Rushing yards','rushYds'],['Rushing touchdowns','rushTDs'],['Carries','rushAtt'],['Fumbles','rushFum'],['Broken tackles','rushBrokenTackles']],
  receiving:[['Receiving yards','recYds'],['Receiving touchdowns','recTDs'],['Receptions','recCatches'],['Drops','recDrops'],['Yards after catch','recYdsAfterCatch']],
  defense:[['Total tackles','defTotalTackles'],['Sacks','defSacks'],['Interceptions','defInts'],['Forced fumbles','defForcedFum'],['Fumble recoveries','defFumRec'],['Defensive touchdowns','defTDs'],['Pass deflections','defDeflections']],
  kicking:[['Kicking points','kickPts'],['Field goals made','fGMade'],['Field-goal percentage','fGCompPct'],['Extra points made','xPMade'],['50+ field goals made','fG50PlusMade']],
  punting:[['Punt yards','puntYds'],['Net punt yards','puntNetYds'],['Punts inside 20','puntsIn20'],['Punt attempts','puntAtt'],['Longest punt','puntLongest']]
};

async function teamsFor(c){
  if(!Array.isArray(c.teams)||!c.teams.length)c.teams=await activeLeagueTeams(c.db,c.league.id);
  return c.teams;
}

function teamChoice(team,{ownerName=null,prefix=''}={}){
  const label=[prefix,team.displayName,team.abbreviation?`(${team.abbreviation})`:null,ownerName?`· ${ownerName}`:null].filter(Boolean).join(' ');
  return choice(label,team.teamKey);
}

async function teamChoices(c,query,{excludeOwn=false}={}){
  const teams=await teamsFor(c),assignments=await activeTeamAssignments(c.db,c.league.id,teams);
  const own=resolveTeam(teams,c.membership?.teamId)?.teamKey;
  return uniqueChoices(teams.filter(team=>!excludeOwn||team.teamKey!==own)
    .filter(team=>matches([team.displayName,team.abbreviation,team.nickname,assignments.get(team.teamKey)?.displayName].join(' '),query))
    .map(team=>teamChoice(team,{ownerName:assignments.get(team.teamKey)?.displayName})));
}

async function ownerChoices(c,query){
  const teams=await teamsFor(c),assignments=await activeTeamAssignments(c.db,c.league.id,teams);
  const own=resolveTeam(teams,c.membership?.teamId)?.teamKey;
  const candidates=[];
  for(const [teamKey,assignment] of assignments){
    const team=resolveTeam(teams,teamKey);
    if(!team||team.teamKey===own||!assignment.discordUserId)continue;
    const username=assignment.discordUsername?`@${assignment.discordUsername}`:assignment.discordGlobalName||assignment.displayName;
    const label=[team.displayName,team.abbreviation?`(${team.abbreviation})`:null,`Discord ${assignment.discordUserId}`,username].filter(Boolean).join(' · ');
    if(matches(`${label} ${assignment.displayName} ${team.nickname||''}`,query)){
      candidates.push(choice(label,`owner:${assignment.discordUserId}`));
    }
  }
  return uniqueChoices(candidates);
}

async function selectedOpponentTeamKey(c,value){
  const teams=await teamsFor(c),selected=clean(value);
  const ownerId=selected.match(/^owner:(\d{17,20})$/)?.[1];
  if(ownerId){
    const assignments=await activeTeamAssignments(c.db,c.league.id,teams);
    for(const [teamKey,assignment] of assignments){
      if(String(assignment.discordUserId||'')===ownerId)return teamKey;
    }
    return null;
  }
  return resolveTeam(teams,selected)?.teamKey||null;
}

async function playerChoices(c,query,{teamKey=null,allowedPublicIds=null,showOverall=false}={}){
  const teams=await teamsFor(c),team=teamKey?resolveTeam(teams,teamKey):null;
  if(teamKey&&!team)return[];
  const allowed=[...new Set((allowedPublicIds||[]).map(clean).filter(Boolean))].slice(0,100);
  if(allowedPublicIds&&!allowed.length)return[];
  const allowedSql=allowed.length?`AND COALESCE(identity.public_id,candidate.externalId) IN (${allowed.map(()=>'?').join(',')})`:'';
  const sql=`WITH candidate AS (
      SELECT record.external_id AS externalId,record.data_json AS dataJson,
        COALESCE(json_extract(record.data_json,'$.display_name'),json_extract(record.data_json,'$.displayName'),
          trim(COALESCE(json_extract(record.data_json,'$.first_name'),json_extract(record.data_json,'$.firstName'),'') || ' ' ||
            COALESCE(json_extract(record.data_json,'$.last_name'),json_extract(record.data_json,'$.lastName'),'')),record.external_id) AS displayName,
        COALESCE(json_extract(record.data_json,'$.team_external_id'),json_extract(record.data_json,'$.team_id'),
          json_extract(record.data_json,'$.teamId'),json_extract(record.data_json,'$.teamID'),
          json_extract(record.data_json,'$.rosterTeamId'),json_extract(record.data_json,'$.roster_team_id'),
          json_extract(record.data_json,'$.currentTeamId'),'') AS teamExternalId
      FROM league_active_snapshots active
      JOIN league_snapshot_records record ON record.league_id=active.league_id AND record.snapshot_id=active.snapshot_id
      WHERE active.league_id=? AND record.domain='players'
    )
    SELECT candidate.externalId,candidate.dataJson,MAX(identity.public_id) AS publicId,
      candidate.displayName,candidate.teamExternalId
    FROM candidate
    LEFT JOIN player_source_aliases alias ON alias.league_id=? AND alias.source_player_id=candidate.externalId
    LEFT JOIN player_identities identity ON identity.league_id=? AND identity.id=alias.player_identity_id
    WHERE (?='' OR instr(lower(candidate.displayName),?)>0 OR instr(lower(candidate.externalId),?)>0
      OR instr(lower(COALESCE(identity.public_id,'')),?)>0)
      AND (? IS NULL OR candidate.teamExternalId=?)
      ${allowedSql}
    GROUP BY candidate.externalId,candidate.dataJson,candidate.displayName,candidate.teamExternalId
    ORDER BY CASE
      WHEN lower(candidate.displayName)=? OR lower(candidate.externalId)=? OR lower(COALESCE(MAX(identity.public_id),''))=? THEN 0
      WHEN substr(lower(candidate.displayName),1,length(?))=? THEN 1 ELSE 2 END,
      lower(candidate.displayName),candidate.externalId
    LIMIT 25`;
  const args=[c.league.id,c.league.id,c.league.id,query,query,query,query,team?.externalId||null,team?.externalId||null,
    ...allowed,query,query,query,query,query];
  const rows=(await c.db.prepare(sql).bind(...args).all()).results||[];
  return uniqueChoices(rows.map(row=>normalizePlayer(JSON.parse(row.dataJson||'{}'),row.publicId)).map(player=>{
    const playerTeam=resolveTeam(teams,player.teamId);
    return choice(showOverall
      ?`${player.displayName} · ${player.position||'—'} · ${player.overall??'—'} OVR`
      :`${player.displayName} · ${player.position||'—'} · ${playerTeam?.abbreviation||'FA'}`,player.publicId||player.id);
  }));
}

async function tradeBlockPlayerChoices(c,query,{listedOnly=false}={}){
  const teams=await teamsFor(c),own=resolveTeam(teams,c.membership?.teamId)?.teamKey;
  if(!own)return[];
  let allowed=null;
  if(listedOnly){
    const result=(await c.db.prepare(`SELECT identity.public_id AS publicId
      FROM trade_block_listings listing
      JOIN player_identities identity ON identity.id=listing.player_identity_id AND identity.league_id=listing.league_id
      WHERE listing.league_id=? AND listing.team_key=? AND listing.asset_type='player' AND listing.active=1
      ORDER BY lower(identity.display_name)`).bind(c.league.id,own).all()).results||[];
    allowed=new Set(result.map(item=>String(item.publicId||'')));
  }
  return playerChoices(c,query,{teamKey:own,allowedPublicIds:allowed?[...allowed]:null,showOverall:true});
}

async function assetChoices(c,query,{teamKey}={}){
  if(!canonicalTeamKey(teamKey))return[];
  const players=await playerChoices(c,query,{teamKey});
  const picks=(await c.db.prepare(`SELECT id,draft_class AS draftClass,round,original_team_key AS originalTeamKey
    FROM league_draft_picks WHERE league_id=? AND current_team_key=?
    ORDER BY draft_class,round,original_team_key`).bind(c.league.id,canonicalTeamKey(teamKey)).all()).results||[];
  const pickChoices=picks.filter(item=>matches(`${item.draftClass} round ${item.round} ${item.originalTeamKey}`,query))
    .map(item=>choice(`Pick · ${item.draftClass} Round ${item.round} (${String(item.originalTeamKey).toUpperCase()})`,`pick:${item.id}`));
  return uniqueChoices([
    ...players.map(item=>choice(`Player · ${item.name}`,`player:${item.value}`)),
    ...pickChoices
  ]);
}

async function standingsChoices(c,query){
  const teams=await teamsFor(c);
  const conferences=[...new Set(teams.map(team=>clean(team.conferenceName)).filter(Boolean))].sort();
  const divisions=[...new Set(teams.map(team=>clean(team.divisionName)).filter(Boolean))].sort();
  const candidates=[
    choice('League · all 32 teams','league'),choice('Conference · all conferences','conference:all'),choice('Division · all divisions','division:all'),
    ...conferences.map(name=>choice(`Conference · ${name}`,`conference:${name}`)),
    ...divisions.map(name=>choice(`Division · ${name}`,`division:${name}`)),
    ...teams.map(team=>choice(`Team · ${team.displayName}${team.abbreviation?` (${team.abbreviation})`:''}`,`team:${team.teamKey}`))
  ];
  return uniqueChoices(candidates.filter(item=>matches(`${item.name} ${item.value}`,query)));
}

async function playoffChoices(c,query){
  const teams=await teamsFor(c);
  const conferences=[...new Set(teams.map(team=>clean(team.conferenceName)).filter(Boolean))].sort();
  return uniqueChoices([
    choice('All conferences · top 10 each','all'),
    ...conferences.map(name=>choice(`${name} · top 10`,name))
  ].filter(item=>matches(`${item.name} ${item.value}`,query)));
}

async function gmChoices(c,query){
  const teams=await teamsFor(c),assignments=await activeTeamAssignments(c.db,c.league.id,teams);
  const candidates=[];
  for(const [teamKey,assignment] of assignments){
    const team=resolveTeam(teams,teamKey);
    candidates.push(choice(`${assignment.displayName} · ${team?.displayName||teamKey}`,assignment.userId));
  }
  const historical=(await c.db.prepare(`SELECT public_id AS publicId,display_name AS displayName FROM gm_identities
    WHERE league_id=? ORDER BY lower(display_name)`).bind(c.league.id).all()).results||[];
  candidates.push(...historical.map(item=>choice(item.displayName,item.publicId)));
  return uniqueChoices(candidates.filter(item=>matches(`${item.name} ${item.value}`,query)));
}

async function ruleChoices(c,query){
  const row=await c.db.prepare(`SELECT rules_json AS rulesJson FROM league_rules_documents WHERE league_id=?`).bind(c.league.id).first();
  let document={categories:[]};try{document=JSON.parse(row?.rulesJson||'{"categories":[]}')}catch{}
  const candidates=[];
  for(const [categoryIndex,category] of (document.categories||[]).entries()){
    candidates.push(choice(`Category · ${category.title}`,`category:${categoryIndex}`));
    for(const [sectionIndex,section] of (category.sections||[]).entries()){
      candidates.push(choice(`Section · ${category.title} · ${section.title}`,`section:${categoryIndex}:${sectionIndex}`));
      for(const [ruleIndex,rule] of (section.rules||[]).entries()){
        const title=clean(rule.title)||clean(rule.text).slice(0,60)||`Rule ${ruleIndex+1}`;
        candidates.push(choice(`Rule · ${title}`,`rule:${categoryIndex}:${sectionIndex}:${ruleIndex}`));
      }
    }
  }
  return uniqueChoices(candidates.filter(item=>matches(item.name,query)));
}

async function tradeChoices(c,query,{review=false}={}){
  const own=canonicalTeamKey(c.membership?.teamId),roles=new Set(['commissioner','trade_committee']);
  const records=(await c.db.prepare(`SELECT workflow.id,workflow.status,workflow.updated_at AS updatedAt,
      group_concat(participant.team_key, ' / ') AS teams
    FROM trade_workflows workflow JOIN trade_workflow_participants participant
      ON participant.trade_id=workflow.id AND participant.league_id=workflow.league_id
    WHERE workflow.league_id=? GROUP BY workflow.id,workflow.status,workflow.updated_at
    ORDER BY workflow.updated_at DESC LIMIT 100`).bind(c.league.id).all()).results||[];
  return uniqueChoices(records.filter(item=>review
    ?item.status==='committee'&&roles.has(c.membership?.role)
    :['negotiating','committee'].includes(item.status)&&clean(item.teams).split(/\s*\/\s*/).map(canonicalTeamKey).includes(own)
  ).filter(item=>matches(`${item.id} ${item.teams}`,query)).map(item=>choice(`${item.teams} · ${item.status}`,item.id)));
}

export async function discordAutocompleteChoices(c){
  const command=discordCommandName(c.interaction);
  const {subcommand,focused,values}=discordFocusedOption(c.interaction);
  if(!focused)return [];
  const query=lower(focused.value),name=focused.name;
  if(command==='standings'&&name==='show')return standingsChoices(c,query);
  if(command==='playoffs'&&name==='conference')return playoffChoices(c,query);
  if(command==='schedule'&&subcommand==='team'&&name==='name')return teamChoices(c,query);
  if(command==='player'&&name==='name')return playerChoices(c,query);
  if(command==='team'&&name==='name')return teamChoices(c,query);
  if(command==='player-stats'&&name==='player')return playerChoices(c,query);
  if(command==='team-stats'&&name==='team')return teamChoices(c,query);
  if(command==='stats'&&name==='name')return lower(values.target)==='team'?teamChoices(c,query):playerChoices(c,query);
  if(command==='leaders'&&name==='metric')return uniqueChoices((METRICS[lower(values.category)||'passing']||[])
    .filter(([label,value])=>matches(`${label} ${value}`,query)).map(([label,value])=>choice(label,value)));
  if(command==='trade-block'&&subcommand==='view'&&name==='team')return teamChoices(c,query);
  if(command==='trade-block'&&['add','remove'].includes(subcommand)&&name==='player'){
    return tradeBlockPlayerChoices(c,query,{listedOnly:subcommand==='remove'});
  }
  if(command==='gm-history'&&name==='show')return gmChoices(c,query);
  if(command==='rules'&&name==='query')return ruleChoices(c,query);
  if(command==='trade'&&subcommand==='create'&&['owner','opponent'].includes(name))return ownerChoices(c,query);
  if(command==='trade'&&subcommand==='create'&&/^send-[1-6]$/.test(name)){
    const teams=await teamsFor(c);return assetChoices(c,query,{teamKey:resolveTeam(teams,c.membership?.teamId)?.teamKey});
  }
  if(command==='trade'&&subcommand==='create'&&/^receive-[1-6]$/.test(name)){
    return assetChoices(c,query,{teamKey:await selectedOpponentTeamKey(c,values.owner||values.opponent)});
  }
  if(command==='trade'&&name==='trade')return tradeChoices(c,query,{review:subcommand==='review'});
  return [];
}
