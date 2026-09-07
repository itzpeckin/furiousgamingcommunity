import { discordCommandName, discordCommandOptions, discordScheduleThreadWeek } from './discord-commands.js';
import {
  confidenceViewCommand,
  gamesCommand,
  gmHistoryCommand,
  gotwCommand,
  leadersCommand,
  newsCommand,
  playerCommand,
  playerStatsCommand,
  playoffsCommand,
  rulesCommand,
  scheduleCommand,
  standingsCommand,
  statsCommand,
  teamStatsCommand,
  tradeBlockCommand,
  tradeHistoryCommand,
  twitchViewCommand
} from './discord-read-model.js';
import {
  joinDiscordLeague,
  requireDiscordRole,
  requireDiscordTeam
} from './discord-security.js';
import { activeLeagueTeams, activeTeamAssignments, resolveTeam } from './league-teams.js';
import { createTenantAuditContext, tenantAuditStatement } from './tenant-context.js';
import { competitionState, executeCompetitionAction } from '../api/leagues/[leagueSlug]/competition.js';
import { executeTradeCenterAction } from '../api/leagues/[leagueSlug]/trade-center.js';
import { queueCommitteeReviewDelivery } from './discord-delivery.js';
import { syncDiscordScheduleThreads } from './discord-schedule.js';

const TWITCH_HANDLE=/^[A-Za-z0-9_]{3,25}$/;
const clean=(value,max=500)=>String(value??'').trim().slice(0,max);

function requestForAudit(interaction){
  return new Request('https://franchisehq.app/api/discord/interactions',{
    method:'POST',headers:{'x-request-id':`discord_${String(interaction.id||crypto.randomUUID()).slice(0,100)}`}
  });
}

async function setTwitch(c,value){
  const raw=clean(value,200).replace(/^@/,'');
  let handle=raw;
  try{
    if(/^https?:\/\//i.test(raw)){
      const url=new URL(raw);
      if(!/(^|\.)twitch\.tv$/i.test(url.hostname))throw new Error('invalid');
      handle=url.pathname.split('/').filter(Boolean)[0]||'';
    }
  }catch{throw Object.assign(new Error('Enter a valid Twitch handle or twitch.tv channel URL.'),{status:400})}
  if(!TWITCH_HANDLE.test(handle))throw Object.assign(new Error('Enter a valid Twitch handle or twitch.tv channel URL.'),{status:400});
  const normalized=handle.toLowerCase();
  const audit=createTenantAuditContext({request:requestForAudit(c.interaction)},c.league,c.session,'discord_twitch_profile_updated');
  await c.db.batch([
    c.db.prepare(`INSERT INTO user_stream_profiles
      (user_id,twitch_handle,twitch_url,updated_by_user_id,created_at,updated_at)
      VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET twitch_handle=excluded.twitch_handle,
        twitch_url=excluded.twitch_url,updated_by_user_id=excluded.updated_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(c.user.id,normalized,`https://www.twitch.tv/${normalized}`,c.user.id),
    tenantAuditStatement(c.db,audit,{resourceType:'user_stream_profile',resourceId:c.user.id,
      detail:{source:'discord-command',selfService:true}})
  ]);
  return `Your Twitch channel is now **[@${normalized} on Twitch](https://www.twitch.tv/${normalized})**.`;
}

async function clearTwitch(c,discordUserId){
  requireDiscordRole(c,'commissioner');
  const target=await c.db.prepare(`SELECT user.id,user.display_name AS displayName
    FROM users user INNER JOIN league_memberships membership ON membership.user_id=user.id
    WHERE membership.league_id=? AND user.discord_user_id=? LIMIT 1`).bind(c.league.id,String(discordUserId||'')).first();
  if(!target)throw Object.assign(new Error('That Discord member is not part of this league.'),{status:404});
  const audit=createTenantAuditContext({request:requestForAudit(c.interaction)},c.league,c.session,'discord_twitch_profile_cleared');
  await c.db.batch([
    c.db.prepare(`DELETE FROM user_stream_profiles WHERE user_id=?`).bind(target.id),
    tenantAuditStatement(c.db,audit,{resourceType:'user_stream_profile',resourceId:target.id,
      detail:{source:'discord-command',commissionerClear:true,replacementBlocked:true}})
  ]);
  return `${target.displayName}’s invalid Twitch channel was cleared.`;
}

function splitAssets(value){
  return clean(value,1200).split(',').map(item=>item.trim()).filter(Boolean);
}

function selectedAssets(values,prefix,legacy){
  const selected=Array.from({length:6},(_,index)=>clean(values[`${prefix}-${index+1}`],200)).filter(Boolean);
  return selected.length?selected:splitAssets(values[legacy]);
}

async function resolveTradeAsset(c,token){
  const match=token.match(/^(player|pick)\s*:\s*(.+)$/i);
  if(!match)throw Object.assign(new Error(`Use player: or pick: before “${token}”.`),{status:400});
  const kind=match[1].toLowerCase(),query=clean(match[2],160);
  if(kind==='player'){
    const row=await c.db.prepare(`SELECT identity.id,identity.public_id AS publicId,identity.display_name AS displayName
      FROM player_identities identity
      LEFT JOIN player_source_aliases alias ON alias.player_identity_id=identity.id AND alias.league_id=identity.league_id
      WHERE identity.league_id=? AND (identity.id=? OR identity.public_id=? OR alias.source_player_id=? OR lower(identity.display_name)=lower(?))
      ORDER BY alias.updated_at DESC LIMIT 1`).bind(c.league.id,query,query,query,query).first();
    if(!row)throw Object.assign(new Error(`Player “${query}” was not found. Use the exact Player Card name or ID.`),{status:404});
    return {assetType:'player',assetId:row.publicId||row.id,label:row.displayName};
  }
  const normalized=query.toLowerCase();
  let row=await c.db.prepare(`SELECT id,draft_class AS draftClass,round,original_team_key AS originalTeamKey
    FROM league_draft_picks WHERE league_id=? AND (id=? OR continuity_key=?) LIMIT 1`).bind(c.league.id,query,query).first();
  if(!row){
    const parsed=normalized.match(/^(20\d{2})[- /](?:r)?([1-7])[- /]([a-z0-9._:-]+)$/);
    if(parsed)row=await c.db.prepare(`SELECT id,draft_class AS draftClass,round,original_team_key AS originalTeamKey
      FROM league_draft_picks WHERE league_id=? AND draft_class=? AND round=? AND lower(original_team_key)=? LIMIT 1`)
      .bind(c.league.id,Number(parsed[1]),Number(parsed[2]),parsed[3]).first();
  }
  if(!row)throw Object.assign(new Error(`Draft pick “${query}” was not found. Use its FranchiseHQ pick ID or YYYY-round-team.`),{status:404});
  return {assetType:'draft-pick',assetId:row.id,label:`${row.draftClass} Round ${row.round} (${String(row.originalTeamKey).toUpperCase()})`};
}

async function createTrade(c,values){
  requireDiscordTeam(c);
  c.teams=await activeLeagueTeams(c.db,c.league.id);
  const own=resolveTeam(c.teams,c.membership.teamId);
  const selectedOwner=clean(values.owner||values.opponent,120);
  const discordOwnerId=selectedOwner.match(/^owner:(\d{17,20})$/)?.[1]||null;
  let opponent=null;
  if(discordOwnerId){
    const assignments=await activeTeamAssignments(c.db,c.league.id,c.teams);
    for(const [teamKey,assignment] of assignments){
      if(String(assignment.discordUserId||'')===discordOwnerId){opponent=resolveTeam(c.teams,teamKey);break}
    }
  }else opponent=resolveTeam(c.teams,selectedOwner);
  if(!own||!opponent)throw Object.assign(new Error('Choose a valid assigned team and opponent.'),{status:400});
  if(own.teamKey===opponent.teamKey)throw Object.assign(new Error('A trade requires another team.'),{status:400});
  const outgoing=await Promise.all(selectedAssets(values,'send','send').map(token=>resolveTradeAsset(c,token)));
  const incoming=await Promise.all(selectedAssets(values,'receive','receive').map(token=>resolveTradeAsset(c,token)));
  if(!outgoing.length||!incoming.length)throw Object.assign(new Error('Both teams must send at least one player or pick.'),{status:400});
  const transfers=[
    ...outgoing.map((asset,index)=>({...asset,fromTeamKey:own.teamKey,toTeamKey:opponent.teamKey,ordinal:index})),
    ...incoming.map((asset,index)=>({...asset,fromTeamKey:opponent.teamKey,toTeamKey:own.teamKey,ordinal:index+outgoing.length}))
  ];
  const result=await executeTradeCenterAction({...c,request:requestForAudit(c.interaction)},{
    action:'propose',transfers,note:clean(values.note,2000)
  });
  return `Trade **${result.tradeId}** was sent to ${opponent.displayName}.\n[Review or revise this trade in FranchiseHQ](https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#trade-center/${encodeURIComponent(result.tradeId)})`;
}

async function tradeBlockAction(c,subcommand,values){
  if(!subcommand||subcommand==='view')return tradeBlockCommand(c,values);
  requireDiscordTeam(c);
  c.teams=await activeLeagueTeams(c.db,c.league.id);
  if(!['add','remove'].includes(subcommand))throw Object.assign(new Error('Choose View, Add, or Remove.'),{status:400});
  const player=clean(values.player,160);
  if(!player)throw Object.assign(new Error('Choose a player from your active roster.'),{status:400});
  await executeTradeCenterAction({...c,request:requestForAudit(c.interaction)}, {
    action:'trade-block',assetType:'player',assetId:player,active:subcommand==='add',
    requestedReturn:clean(values['looking-for'],1000)
  });
  const href=`https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#players/${encodeURIComponent(player)}`;
  return subcommand==='add'
    ?`**[Player added to the Trade Block](${href})**${values['looking-for']?`\nLooking for: ${clean(values['looking-for'],1000)}`:''}`
    :`**[Player removed from the Trade Block](${href})**`;
}

async function currentTradeMutation(c,tradeId){
  const row=await c.db.prepare(`SELECT revision,mutation_token AS mutationToken,status
    FROM trade_workflows WHERE id=? AND league_id=? LIMIT 1`).bind(clean(tradeId,120),c.league.id).first();
  if(!row)throw Object.assign(new Error('Trade not found.'),{status:404});
  return row;
}

async function respondToTrade(c,subcommand,values){
  requireDiscordTeam(c);
  c.teams=await activeLeagueTeams(c.db,c.league.id);
  const tradeId=clean(values.trade,120),current=await currentTradeMutation(c,tradeId);
  const result=await executeTradeCenterAction({...c,request:requestForAudit(c.interaction)},{
    action:subcommand,tradeId,revision:Number(current.revision),mutationToken:current.mutationToken,reason:clean(values.reason,2000)
  });
  if(subcommand==='accept'){
    const trade=result.workflows?.find(item=>item.id===tradeId);
    if(trade?.status==='committee')await queueCommitteeReviewDelivery(c.db,{league:c.league,tradeId});
  }
  return `Trade **${tradeId}** was ${subcommand==='accept'?'accepted':'rejected'} successfully.`;
}

async function reviewTrade(c,values){
  requireDiscordRole(c,['commissioner','trade_committee']);
  c.teams=await activeLeagueTeams(c.db,c.league.id);
  const tradeId=clean(values.trade,120),current=await currentTradeMutation(c,tradeId);
  await executeTradeCenterAction({...c,request:requestForAudit(c.interaction)},{
    action:'review',tradeId,revision:Number(current.revision),mutationToken:current.mutationToken,
    decision:clean(values.decision,20),reason:clean(values.reason,2000),freeTrade:values['free-trade']===true
  });
  return `Your **${clean(values.decision,20)}** decision was recorded for trade **${tradeId}**.`;
}

async function confidenceAction(c,subcommand,values){
  if(subcommand==='view')return confidenceViewCommand(c);
  const request=requestForAudit(c.interaction);
  if(subcommand==='pick'){
    const state=await competitionState(c);
    const game=state.games.find(item=>String(item.id)===String(values.game));
    if(!game)throw Object.assign(new Error('That game is not in the active schedule.'),{status:404});
    const teams=await activeLeagueTeams(c.db,c.league.id);
    const selected=resolveTeam(teams,values.team);
    const selectedId=[game.homeTeamId,game.awayTeamId].find(id=>resolveTeam(teams,id)?.teamKey===selected?.teamKey);
    if(!selectedId)throw Object.assign(new Error('Choose one of the two teams in that game.'),{status:400});
    await executeCompetitionAction({...c,request},{action:'save-confidence-pick',gameId:game.id,
      selectedTeamId:selectedId,confidenceValue:Number(values.confidence)});
    return `Saved **${selected.abbreviation||selected.displayName}** with confidence **${Number(values.confidence)}** for ${game.id}. Your unfinished picks remain private.`;
  }
  if(subcommand==='submit'){
    await executeCompetitionAction({...c,request},{action:'submit-confidence-week',weekIndex:Number(values.week)});
    return `Your Week ${Number(values.week)} Confidence Pool entry was submitted.`;
  }
  throw Object.assign(new Error('Choose a valid Confidence Pool action.'),{status:400});
}

export async function executeDiscordCommand(c){
  const command=discordCommandName(c.interaction);
  const {subcommand,values}=discordCommandOptions(c.interaction);
  const legacyWeek=discordScheduleThreadWeek(command);
  if(legacyWeek){
    requireDiscordRole(c,'commissioner');
    const channelId=String(c.installation?.scheduleChannelId||c.interaction?.channel_id||'').trim();
    const result=await syncDiscordScheduleThreads(c.env,c.db,{
      league:c.league,week:legacyWeek,channelId,source:'discord-command',requestedByUserId:c.user.id
    });
    if(result.skipped)throw Object.assign(new Error(
      result.reason==='no-games-for-week'
        ?`The active FranchiseHQ schedule does not contain Regular Season Week ${legacyWeek}.`
        :'FranchiseHQ could not prepare schedule threads in this channel.'
    ),{status:409,code:result.reason});
    return `Week ${legacyWeek} schedule synchronized: **${result.threads} matchup thread${result.threads===1?'':'s'}** in the configured schedule channel using ${result.registeredOwners} registered owner identit${result.registeredOwners===1?'y':'ies'}.`;
  }
  if(command==='join'){
    await joinDiscordLeague(c,requestForAudit(c.interaction));
    return `Welcome to **${c.league.name}**. Your FranchiseHQ access is active but unassigned. A commissioner must assign a team before team and trade actions are available.\n[Open ${c.league.name} in FranchiseHQ](https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)})`;
  }
  if(command==='standings')return standingsCommand(c,values);
  if(command==='playoffs')return playoffsCommand(c,values);
  if(command==='schedule')return scheduleCommand(c,values);
  if(command==='games')return gamesCommand(c,values);
  if(command==='stats')return statsCommand(c,values);
  if(command==='player-stats')return playerStatsCommand(c,values);
  if(command==='team-stats')return teamStatsCommand(c,values);
  if(command==='leaders')return leadersCommand(c,values);
  if(command==='player')return playerCommand(c,values);
  if(command==='team')return teamStatsCommand(c,{...values,team:values.name});
  if(command==='trade-block')return tradeBlockAction(c,subcommand,values);
  if(command==='trade-history')return tradeHistoryCommand(c);
  if(command==='news')return newsCommand(c);
  if(command==='gotw')return gotwCommand(c,values);
  if(command==='league-site')return `**[Open ${c.league.name} in FranchiseHQ](https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)})**`;
  if(command==='gm-history')return gmHistoryCommand(c,values);
  if(command==='rules')return rulesCommand(c,values);
  if(command==='twitch'){
    if(subcommand==='view')return twitchViewCommand(c,values,c.interaction);
    if(subcommand==='set')return setTwitch(c,values.channel);
    if(subcommand==='clear')return clearTwitch(c,values.member);
  }
  if(command==='confidence')return confidenceAction(c,subcommand,values);
  if(command==='trade'){
    if(subcommand==='multi-team')return `Open the private [${c.league.name} multi-team trade composer](https://franchisehq.app/leagues/${encodeURIComponent(c.league.slug)}#trade-center/multi-new).`;
    if(subcommand==='create')return createTrade(c,values);
    if(['accept','reject'].includes(subcommand))return respondToTrade(c,subcommand,values);
    if(subcommand==='review')return reviewTrade(c,values);
  }
  throw Object.assign(new Error('That FranchiseHQ Discord command is not available.'),{status:400,code:'unknown-command'});
}
