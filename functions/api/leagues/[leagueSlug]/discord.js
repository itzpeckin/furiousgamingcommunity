import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../_lib/permissions.js';
import { createTenantAuditContext, tenantAuditStatement } from '../../../_lib/tenant-context.js';
import { DISCORD_COMMAND_RELEASE } from '../../../_lib/discord-commands.js';

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
      trade_committee_channel_id AS tradeCommitteeChannelId,notification_channel_id AS notificationChannelId,
      status,installed_at AS installedAt,updated_at AS updatedAt
    FROM discord_league_installations WHERE league_id=? LIMIT 1`).bind(c.league.id).first();
  const clientId=String(c.env.DISCORD_CLIENT_ID||'').trim();
  return {
    ok:true,release:DISCORD_COMMAND_RELEASE,
    league:{id:c.league.id,slug:c.league.slug,name:c.league.name},
    installation:row||null,
    globalCommands:true,
    installUrl:SNOWFLAKE.test(clientId)
      ?`https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&scope=bot%20applications.commands&permissions=19456`
      :null,
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
      const notifications=cleanSnowflake(body.notificationChannelId,false);
      const applicationId=cleanSnowflake(c.env.DISCORD_CLIENT_ID,true);
      await c.db.batch([
        c.db.prepare(`INSERT INTO discord_league_installations
          (id,league_id,discord_guild_id,application_id,trade_committee_channel_id,notification_channel_id,status,installed_by_user_id,installed_at,updated_at)
          VALUES (?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(league_id) DO UPDATE SET discord_guild_id=excluded.discord_guild_id,
            application_id=excluded.application_id,trade_committee_channel_id=excluded.trade_committee_channel_id,
            notification_channel_id=excluded.notification_channel_id,status='active',
            installed_by_user_id=excluded.installed_by_user_id,updated_at=CURRENT_TIMESTAMP`)
          .bind(`discord_installation_${crypto.randomUUID()}`,c.league.id,guildId,applicationId,committee,notifications,c.session.user.id),
        c.db.prepare(`UPDATE leagues SET discord_guild_id=?,discord_connected=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
          .bind(guildId,c.league.id),
        tenantAuditStatement(c.db,audit,{resourceType:'discord_league_installation',resourceId:guildId,
          detail:{action,committeeChannelConfigured:Boolean(committee),notificationChannelConfigured:Boolean(notifications)}})
      ]);
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
