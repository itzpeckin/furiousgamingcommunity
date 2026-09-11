import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../_lib/permissions.js';
import { createTenantAuditContext, tenantAuditStatement } from '../../../_lib/tenant-context.js';
import { DISCORD_COMMAND_RELEASE, DISCORD_GLOBAL_COMMANDS } from '../../../_lib/discord-commands.js';
import { latestDiscordScheduleSync } from '../../../_lib/discord-schedule.js';
import { discordGuildRoles, discordGuildTextChannels } from '../../../_lib/discord-installation.js';
import { upsertDiscordGlobalCommands } from '../../../_lib/discord-api.js';

const SNOWFLAKE=/^[0-9]{17,20}$/;
const cleanSnowflake=(value,required=false)=>{
  const id=String(value||'').trim();
  if(!id&&!required)return null;
  if(!SNOWFLAKE.test(id))throw Object.assign(new Error('A valid Discord ID is required.'),{status:400});
  return id;
};

async function requestContext(context){
  const authorization=await requireCommissioner(context);
  if(!authorization.authorized)return {response:authorization.response};
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return {response:json({ok:false,error:'Invalid league slug.'},400)};
  const db=database(context.env),league=await resolveLeague(context.env,slug);
  if(!db||!league||authorization.session.membership?.leagueId!==league.id){
    return {response:json({ok:false,error:'Not found.'},404)};
  }
  return {db,league,session:authorization.session,request:context.request,env:context.env};
}

async function state(c){
  const row=await c.db.prepare(`SELECT discord_guild_id AS guildId,application_id AS applicationId,
      trade_committee_channel_id AS tradeCommitteeChannelId,trade_committee_role_id AS tradeCommitteeRoleId,
      notification_channel_id AS notificationChannelId,
      guild_name AS guildName,schedule_channel_id AS scheduleChannelId,trade_channel_id AS tradeChannelId,
      connection_source AS connectionSource,
      connected_at AS connectedAt,status,installed_at AS installedAt,updated_at AS updatedAt
    FROM discord_league_installations WHERE league_id=? LIMIT 1`).bind(c.league.id).first();
  const origin=new URL(c.request.url).origin;
  let channels=[],roles=[],channelError=null,roleError=null;
  if(row?.status==='active'&&row?.guildId){
    const [channelResult,roleResult]=await Promise.allSettled([
      discordGuildTextChannels(c.env,row.guildId),discordGuildRoles(c.env,row.guildId)
    ]);
    if(channelResult.status==='fulfilled')channels=channelResult.value;
    else{channelError='FranchiseHQ could not refresh the server channel list. Existing routing remains unchanged.';console.error('Discord channel list failed:',channelResult.reason?.message||channelResult.reason)}
    if(roleResult.status==='fulfilled')roles=roleResult.value;
    else{roleError='FranchiseHQ could not refresh the server role list. Existing Trade Committee tagging remains unchanged.';console.error('Discord role list failed:',roleResult.reason?.message||roleResult.reason)}
  }
  return {
    ok:true,release:DISCORD_COMMAND_RELEASE,
    league:{id:c.league.id,slug:c.league.slug,name:c.league.name},
    installation:row||null,
    channels,roles,channelError,roleError,
    scheduleSync:await latestDiscordScheduleSync(c.db,c.league.id),
    globalCommands:true,
    automaticConnection:true,
    connectUrl:`${origin}/api/leagues/${encodeURIComponent(c.league.slug)}/discord/connect`,
    endpoint:`${new URL(c.request.url).origin}/api/discord/interactions`
  };
}

export async function onRequestGet(context){
  try{const c=await requestContext(context);return c.response||json(await state(c));}
  catch(error){return json({ok:false,release:DISCORD_COMMAND_RELEASE,error:error?.message||'Discord settings could not be loaded.'},Number(error?.status)||500)}
}

export async function onRequestPost(context){
  try{
    const c=await requestContext(context);if(c.response)return c.response;
    let body={};try{body=await context.request.json()}catch{return json({ok:false,error:'Request body must be valid JSON.'},400)}
    const action=String(body.action||'').trim();
    const audit=createTenantAuditContext(context,c.league,c.session,`discord_installation_${action||'unknown'}`);
    if(action==='connect'||action==='update'){
      const guildId=cleanSnowflake(body.guildId,true);
      const committee=cleanSnowflake(body.tradeCommitteeChannelId,false);
      const committeeRole=cleanSnowflake(body.tradeCommitteeRoleId,false);
      const notifications=cleanSnowflake(body.notificationChannelId,false);
      const applicationId=cleanSnowflake(c.env.DISCORD_CLIENT_ID,true);
      await c.db.batch([
        c.db.prepare(`INSERT INTO discord_league_installations
          (id,league_id,discord_guild_id,application_id,trade_committee_channel_id,trade_committee_role_id,notification_channel_id,status,installed_by_user_id,installed_at,updated_at)
          VALUES (?,?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(league_id) DO UPDATE SET discord_guild_id=excluded.discord_guild_id,
            application_id=excluded.application_id,trade_committee_channel_id=excluded.trade_committee_channel_id,
            trade_committee_role_id=excluded.trade_committee_role_id,
            notification_channel_id=excluded.notification_channel_id,status='active',
            installed_by_user_id=excluded.installed_by_user_id,updated_at=CURRENT_TIMESTAMP`)
          .bind(`discord_installation_${crypto.randomUUID()}`,c.league.id,guildId,applicationId,committee,committeeRole,notifications,c.session.user.id),
        c.db.prepare(`UPDATE leagues SET discord_guild_id=?,discord_connected=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(guildId,c.league.id),
        tenantAuditStatement(c.db,audit,{resourceType:'discord_league_installation',resourceId:guildId,
          detail:{action,committeeChannelConfigured:Boolean(committee),committeeRoleConfigured:Boolean(committeeRole),notificationChannelConfigured:Boolean(notifications)}})
      ]);
    }else if(action==='configure-channels'){
      const installation=await c.db.prepare(`SELECT discord_guild_id AS guildId FROM discord_league_installations
        WHERE league_id=? AND status='active' LIMIT 1`).bind(c.league.id).first();
      if(!installation?.guildId)throw Object.assign(new Error('Connect this league to Discord before choosing channels.'),{status:409});
      const [channels,roles]=await Promise.all([
        discordGuildTextChannels(c.env,installation.guildId),discordGuildRoles(c.env,installation.guildId)
      ]);
      const allowed=new Set(channels.map(channel=>channel.id));
      const allowedRoles=new Set(roles.map(role=>role.id));
      const schedule=cleanSnowflake(body.scheduleChannelId,true);
      const trade=cleanSnowflake(body.tradeChannelId,false);
      const committee=cleanSnowflake(body.tradeCommitteeChannelId,false);
      const committeeRole=cleanSnowflake(body.tradeCommitteeRoleId,false);
      const notifications=cleanSnowflake(body.notificationChannelId,false);
      if(!allowed.has(schedule)||trade&&!allowed.has(trade)||committee&&!allowed.has(committee)||notifications&&!allowed.has(notifications)){
        throw Object.assign(new Error('Choose channels that belong to the connected Discord server.'),{status:400});
      }
      if(committeeRole&&!allowedRoles.has(committeeRole)){
        throw Object.assign(new Error('Choose a mentionable, non-managed role from the connected Discord server.'),{status:400});
      }
      await c.db.batch([
        c.db.prepare(`UPDATE discord_league_installations SET schedule_channel_id=?,trade_channel_id=?,
          trade_committee_channel_id=?,trade_committee_role_id=?,notification_channel_id=?,updated_at=CURRENT_TIMESTAMP
          WHERE league_id=? AND status='active'`)
          .bind(schedule,trade,committee,committeeRole,notifications,c.league.id),
        tenantAuditStatement(c.db,audit,{resourceType:'discord_league_installation',resourceId:installation.guildId,
          detail:{action,scheduleChannelId:schedule,tradeChannelConfigured:Boolean(trade),committeeChannelConfigured:Boolean(committee),committeeRoleConfigured:Boolean(committeeRole),notificationChannelConfigured:Boolean(notifications),selectedFromVerifiedGuildChannels:true,selectedFromVerifiedGuildRoles:true}})
      ]);
      const reconcile=upsertDiscordGlobalCommands(c.env,DISCORD_GLOBAL_COMMANDS).catch(error=>
        console.error('Discord global command reconciliation failed:',String(error?.message||error).slice(0,500)));
      const waitUntil=context.waitUntil||context.executionContext?.waitUntil;
      if(typeof waitUntil==='function')waitUntil.call(context.executionContext||context,reconcile);
      else await reconcile;
    }else if(action==='disable'){
      await c.db.batch([
        c.db.prepare(`UPDATE discord_league_installations SET status='disabled',updated_at=CURRENT_TIMESTAMP WHERE league_id=?`)
          .bind(c.league.id),
        c.db.prepare(`UPDATE leagues SET discord_connected=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(c.league.id),
        tenantAuditStatement(c.db,audit,{resourceType:'discord_league_installation',resourceId:c.league.id,
          detail:{action,relationshipRetained:true}})
      ]);
    }else{
      return json({ok:false,error:'Unknown Discord installation action.'},400);
    }
    return json(await state(c));
  }catch(error){
    const uniqueConflict=/UNIQUE constraint failed/i.test(String(error?.message||''));
    const message=uniqueConflict
      ?'That Discord server is already connected to another FranchiseHQ league.'
      :(error?.message||'Discord settings could not be saved.');
    return json({ok:false,release:DISCORD_COMMAND_RELEASE,error:message},uniqueConflict?409:(Number(error?.status)||500));
  }
}
