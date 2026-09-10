import { createId } from './auth.js';
import { resolveTenantById, tenantDatabase, createTenantAuditContext, tenantAuditStatement } from './tenant-context.js';
import { sha256Hex } from './cloud-platform.js';
import { activeLeagueTeams, resolveTeam } from './league-teams.js';

export const DISCORD_INTERACTION_TYPES=Object.freeze({PING:1,APPLICATION_COMMAND:2,MESSAGE_COMPONENT:3,APPLICATION_COMMAND_AUTOCOMPLETE:4,MODAL_SUBMIT:5});
export const DISCORD_RESPONSE_TYPES=Object.freeze({PONG:1,CHANNEL_MESSAGE:4,DEFERRED_CHANNEL_MESSAGE:5,DEFERRED_UPDATE_MESSAGE:6,UPDATE_MESSAGE:7,APPLICATION_COMMAND_AUTOCOMPLETE_RESULT:8,MODAL:9});
export const DISCORD_EPHEMERAL_FLAG=64;
const MAX_BODY_BYTES=128*1024;
const MAX_TIMESTAMP_SKEW_SECONDS=5*60;
const SNOWFLAKE=/^[0-9]{17,20}$/;
const MANAGE_GUILD=1n<<5n;
const ADMINISTRATOR=1n<<3n;

function hexBytes(value){
  const hex=String(value||'').trim().toLowerCase();
  if(!/^[0-9a-f]+$/.test(hex)||hex.length%2!==0)return null;
  return Uint8Array.from(hex.match(/.{2}/g)||[],part=>Number.parseInt(part,16));
}

function discordUser(interaction={}){
  return interaction?.member?.user||interaction?.user||null;
}

export async function verifyDiscordInteractionRequest(request,publicKey,{now=Date.now()}={}){
  const signature=request.headers.get('x-signature-ed25519');
  const timestamp=request.headers.get('x-signature-timestamp');
  const keyBytes=hexBytes(publicKey),signatureBytes=hexBytes(signature);
  if(!keyBytes||keyBytes.length!==32||!signatureBytes||signatureBytes.length!==64||!/^\d{10,13}$/.test(String(timestamp||''))){
    return {verified:false,status:401,error:'Invalid Discord request signature.'};
  }
  const timestampSeconds=Number(timestamp)>1e12?Number(timestamp)/1000:Number(timestamp);
  if(!Number.isFinite(timestampSeconds)||Math.abs(now/1000-timestampSeconds)>MAX_TIMESTAMP_SKEW_SECONDS){
    return {verified:false,status:401,error:'Expired Discord request signature.'};
  }
  const rawBody=await request.text();
  if(new TextEncoder().encode(rawBody).byteLength>MAX_BODY_BYTES){
    return {verified:false,status:413,error:'Discord interaction is too large.'};
  }
  try{
    const key=await crypto.subtle.importKey('raw',keyBytes,{name:'Ed25519'},false,['verify']);
    const data=new TextEncoder().encode(`${timestamp}${rawBody}`);
    const verified=await crypto.subtle.verify({name:'Ed25519'},key,signatureBytes,data);
    if(!verified)return {verified:false,status:401,error:'Invalid Discord request signature.'};
    const interaction=JSON.parse(rawBody);
    if(!interaction||typeof interaction!=='object')throw new Error('invalid');
    return {verified:true,rawBody,interaction};
  }catch(error){
    return {verified:false,status:400,error:'Discord interaction body is invalid.'};
  }
}

export function discordInteractionResponse(type,data=null){
  return new Response(JSON.stringify(data?{type,data}:{type}),{
    status:200,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
  });
}

export function discordErrorResponse(message='This action could not be completed.'){
  return discordInteractionResponse(DISCORD_RESPONSE_TYPES.CHANNEL_MESSAGE,{
    content:String(message).slice(0,1900),flags:DISCORD_EPHEMERAL_FLAG,allowed_mentions:{parse:[]}
  });
}

export function discordMessageData(message){
  const source=message&&typeof message==='object'&&!Array.isArray(message)?message:{content:message};
  const content=source.content===null||source.content===undefined?'':String(source.content).slice(0,2000);
  const embeds=Array.isArray(source.embeds)?source.embeds.slice(0,10).map(embed=>({
    ...embed,
    ...(embed?.title?{title:String(embed.title).slice(0,256)}:{}),
    ...(embed?.description?{description:String(embed.description).slice(0,4096)}:{}),
    ...(Array.isArray(embed?.fields)?{fields:embed.fields.slice(0,25).map(field=>({
      name:String(field?.name||'Details').slice(0,256),value:String(field?.value||'—').slice(0,1024),inline:Boolean(field?.inline)
    }))}:{})
  })):[];
  const components=Array.isArray(source.components)?source.components.slice(0,5).map(row=>({
    type:1,
    components:(Array.isArray(row?.components)?row.components:[]).slice(0,5).map(component=>{
      const style=Math.min(5,Math.max(1,Number(component?.style)||2));
      if(style===5&&component?.url)return {type:2,style,label:String(component?.label||'Open').slice(0,80),url:String(component.url).slice(0,512)};
      const customId=String(component?.custom_id||'').slice(0,100);
      return customId?{type:2,style:Math.min(4,style),label:String(component?.label||'Action').slice(0,80),custom_id:customId,disabled:Boolean(component?.disabled)}:null;
    }).filter(Boolean)
  })).filter(row=>row.components.length):[];
  return {
    ...(content?{content}:{}),
    ...(embeds.length?{embeds}:{}),
    ...(components.length?{components}:{}),
    allowed_mentions:{parse:[]}
  };
}

function canManageInteractionGuild(interaction){
  try{
    const permissions=BigInt(String(interaction?.member?.permissions||'0'));
    return Boolean((permissions&MANAGE_GUILD)||(permissions&ADMINISTRATOR));
  }catch{return false}
}

async function bootstrapCommissionerGuild(db,env,interaction,identity){
  const guildId=String(interaction?.guild_id||'').trim();
  const channelId=String(interaction?.channel_id||'').trim();
  const applicationId=String(interaction?.application_id||'').trim();
  if(!canManageInteractionGuild(interaction)||!SNOWFLAKE.test(channelId)
    ||applicationId!==String(env?.DISCORD_CLIENT_ID||'').trim())return null;
  const memberships=await db.prepare(`SELECT user.id AS userId,membership.league_id AS leagueId,
      membership.id AS membershipId,membership.role,membership.team_id AS teamId
    FROM users user
    JOIN league_memberships membership ON membership.user_id=user.id
    WHERE user.discord_user_id=? AND membership.active=1 AND membership.role='commissioner'`)
    .bind(String(identity?.id||'')).all();
  const candidates=memberships.results||[];
  if(candidates.length!==1)return null;
  const candidate=candidates[0];
  const conflicting=await db.prepare(`SELECT league_id AS leagueId FROM discord_league_installations
    WHERE discord_guild_id=? AND league_id<>? LIMIT 1`).bind(guildId,candidate.leagueId).first();
  const leagueConflict=await db.prepare(`SELECT discord_guild_id AS guildId FROM discord_league_installations
    WHERE league_id=? AND discord_guild_id<>? AND status='active' LIMIT 1`).bind(candidate.leagueId,guildId).first();
  if(conflicting||leagueConflict)return null;
  const league=await resolveTenantById(env,candidate.leagueId);
  if(!league)return null;
  const session={user:{id:candidate.userId},membership:{
    id:candidate.membershipId,leagueId:candidate.leagueId,role:candidate.role,teamId:candidate.teamId,active:true
  }};
  const request=new Request('https://franchisehq.app/api/discord/interactions',{method:'POST',headers:{
    'x-request-id':`discord_bootstrap_${String(interaction.id||crypto.randomUUID()).slice(0,80)}`
  }});
  const audit=createTenantAuditContext({request},league,session,'discord_installation_command_bootstrap');
  await db.batch([
    db.prepare(`INSERT INTO discord_league_installations
      (id,league_id,discord_guild_id,application_id,schedule_channel_id,status,connection_source,
       connected_at,installed_by_user_id,installed_at,updated_at)
      VALUES (?,?,?,?,?,'active','signed-command-bootstrap',CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id) DO UPDATE SET discord_guild_id=excluded.discord_guild_id,
        application_id=excluded.application_id,schedule_channel_id=excluded.schedule_channel_id,status='active',
        connection_source='signed-command-bootstrap',connected_at=CURRENT_TIMESTAMP,
        installed_by_user_id=excluded.installed_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(`discord_installation_${crypto.randomUUID()}`,candidate.leagueId,guildId,applicationId,channelId,candidate.userId),
    db.prepare(`UPDATE leagues SET discord_guild_id=?,discord_connected=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(guildId,candidate.leagueId),
    tenantAuditStatement(db,audit,{resourceType:'discord_league_installation',resourceId:guildId,
      detail:{source:'signed-command-bootstrap',scheduleChannelId:channelId,registeredCommissionerIdentity:true}})
  ]);
  return db.prepare(`SELECT id,league_id AS leagueId,discord_guild_id AS guildId,
      application_id AS applicationId,trade_committee_channel_id AS tradeCommitteeChannelId,
      notification_channel_id AS notificationChannelId,schedule_channel_id AS scheduleChannelId,
      trade_channel_id AS tradeChannelId,status
    FROM discord_league_installations WHERE league_id=? LIMIT 1`).bind(candidate.leagueId).first();
}

export async function resolveDiscordContext(env,interaction,{membershipRequired=true,allowCommissionerBootstrap=false}={}){
  const db=tenantDatabase(env);
  if(!db)throw Object.assign(new Error('FranchiseHQ data is temporarily unavailable.'),{status:503,code:'database-unavailable'});
  const guildId=String(interaction?.guild_id||'').trim();
  if(!SNOWFLAKE.test(guildId))throw Object.assign(new Error('Use this command inside a connected league Discord server.'),{status:403,code:'guild-required'});
  let installation=await db.prepare(`SELECT id,league_id AS leagueId,discord_guild_id AS guildId,
      application_id AS applicationId,trade_committee_channel_id AS tradeCommitteeChannelId,
      notification_channel_id AS notificationChannelId,schedule_channel_id AS scheduleChannelId,
      trade_channel_id AS tradeChannelId,status
    FROM discord_league_installations
    WHERE discord_guild_id=? AND status='active' LIMIT 1`).bind(guildId).first();
  const identity=discordUser(interaction);
  if(!installation&&allowCommissionerBootstrap){
    installation=await bootstrapCommissionerGuild(db,env,interaction,identity);
  }
  if(!installation)throw Object.assign(new Error('This Discord server is not connected to a FranchiseHQ league.'),{status:404,code:'guild-unmapped'});
  if(installation.applicationId&&String(interaction.application_id||'')!==String(installation.applicationId)){
    throw Object.assign(new Error('This Discord application is not authorized for the connected league.'),{status:403,code:'application-mismatch'});
  }
  const league=await resolveTenantById(env,installation.leagueId);
  if(!league)throw Object.assign(new Error('The connected FranchiseHQ league is unavailable.'),{status:404,code:'league-unavailable'});
  const discordUserId=String(identity?.id||'');
  if(!SNOWFLAKE.test(discordUserId))throw Object.assign(new Error('Discord identity could not be verified.'),{status:401,code:'identity-missing'});
  const actor=await db.prepare(`SELECT user.id,user.discord_user_id AS discordUserId,
      user.discord_username AS discordUsername,user.discord_global_name AS discordGlobalName,
      user.display_name AS displayName,user.avatar_url AS avatarUrl,
      membership.id AS membershipId,membership.role,membership.team_id AS teamId,membership.active
    FROM users user
    LEFT JOIN league_memberships membership ON membership.user_id=user.id AND membership.league_id=?
    WHERE user.discord_user_id=? LIMIT 1`).bind(league.id,discordUserId).first();
  const membership=actor?.membershipId?{
    id:actor.membershipId,leagueId:league.id,leagueSlug:league.slug,leagueName:league.name,
    role:actor.role,teamId:actor.teamId,active:Boolean(actor.active)
  }:null;
  if(membershipRequired&&(!membership||!membership.active)){
    throw Object.assign(new Error('Join this league first with `/join`, or contact a commissioner if access was revoked.'),{status:403,code:'membership-required'});
  }
  const user=actor?{
    id:actor.id,discordUserId:actor.discordUserId,discordUsername:actor.discordUsername,
    discordGlobalName:actor.discordGlobalName,displayName:actor.displayName,avatarUrl:actor.avatarUrl
  }:null;
  return {db,env,league,installation,discordIdentity:identity,user,membership,session:user?{user,membership}:null,interaction};
}

export async function resolveDiscordTradeComponentContext(env,interaction,{tradeId,access='participant'}={}){
  const db=tenantDatabase(env);
  if(!db)throw Object.assign(new Error('FranchiseHQ data is temporarily unavailable.'),{status:503,code:'database-unavailable'});
  const target=await db.prepare(`SELECT workflow.league_id AS leagueId,
      installation.discord_guild_id AS guildId,installation.application_id AS applicationId,
      installation.trade_committee_channel_id AS tradeCommitteeChannelId,
      installation.notification_channel_id AS notificationChannelId,
      installation.schedule_channel_id AS scheduleChannelId,installation.trade_channel_id AS tradeChannelId,
      installation.status AS installationStatus
    FROM trade_workflows workflow
    LEFT JOIN discord_league_installations installation ON installation.league_id=workflow.league_id
    WHERE workflow.id=? LIMIT 1`).bind(String(tradeId||'')).first();
  if(!target)throw Object.assign(new Error('This trade is no longer available.'),{status:404,code:'trade-unavailable'});
  if(target.installationStatus!=='active')throw Object.assign(new Error('This league’s Discord connection is not active.'),{status:409,code:'installation-inactive'});
  if(target.applicationId&&String(interaction.application_id||'')!==String(target.applicationId)){
    throw Object.assign(new Error('This Discord application is not authorized for the trade.'),{status:403,code:'application-mismatch'});
  }
  const guildId=String(interaction?.guild_id||'').trim();
  if(guildId&&guildId!==String(target.guildId||'')){
    throw Object.assign(new Error('This trade belongs to another connected Discord server.'),{status:403,code:'guild-mismatch'});
  }
  const league=await resolveTenantById(env,target.leagueId);
  if(!league)throw Object.assign(new Error('The connected FranchiseHQ league is unavailable.'),{status:404,code:'league-unavailable'});
  const identity=discordUser(interaction),discordUserId=String(identity?.id||'');
  if(!SNOWFLAKE.test(discordUserId))throw Object.assign(new Error('Discord identity could not be verified.'),{status:401,code:'identity-missing'});
  const actor=await db.prepare(`SELECT user.id,user.discord_user_id AS discordUserId,
      user.discord_username AS discordUsername,user.discord_global_name AS discordGlobalName,
      user.display_name AS displayName,user.avatar_url AS avatarUrl,
      membership.id AS membershipId,membership.role,membership.team_id AS teamId,membership.active
    FROM users user JOIN league_memberships membership ON membership.user_id=user.id AND membership.league_id=?
    WHERE user.discord_user_id=? LIMIT 1`).bind(league.id,discordUserId).first();
  if(!actor?.membershipId||!Boolean(actor.active)){
    throw Object.assign(new Error('Your active FranchiseHQ league membership is required.'),{status:403,code:'membership-required'});
  }
  const teams=await activeLeagueTeams(db,league.id),team=resolveTeam(teams,actor.teamId);
  const teamKey=team?.teamKey||String(actor.teamId||'').trim().toLowerCase();
  const participant=teamKey?await db.prepare(`SELECT 1 AS allowed FROM trade_workflow_participants
    WHERE trade_id=? AND league_id=? AND team_key=? LIMIT 1`).bind(String(tradeId),league.id,teamKey).first():null;
  const reviewer=['commissioner','trade_committee'].includes(String(actor.role||''));
  if(access==='reviewer'&&(!reviewer||participant?.allowed)){
    throw Object.assign(new Error(participant?.allowed?'Reviewers cannot vote on a trade involving their own team.':'Trade Committee access is required.'),{status:403,code:'trade-reviewer-required'});
  }
  if(access!=='reviewer'&&!participant?.allowed){
    throw Object.assign(new Error('Only an owner whose team is involved may respond to this trade.'),{status:403,code:'trade-participant-required'});
  }
  const installation={leagueId:league.id,guildId:target.guildId,applicationId:target.applicationId,
    tradeCommitteeChannelId:target.tradeCommitteeChannelId,notificationChannelId:target.notificationChannelId,
    scheduleChannelId:target.scheduleChannelId,tradeChannelId:target.tradeChannelId,status:target.installationStatus};
  const membership={id:actor.membershipId,leagueId:league.id,leagueSlug:league.slug,leagueName:league.name,
    role:actor.role,teamId:actor.teamId,teamKey,active:true};
  const user={id:actor.id,discordUserId:actor.discordUserId,discordUsername:actor.discordUsername,
    discordGlobalName:actor.discordGlobalName,displayName:actor.displayName,avatarUrl:actor.avatarUrl};
  return {db,env,league,installation,discordIdentity:identity,user,membership,session:{user,membership},interaction,teams};
}

export function requireDiscordTeam(c){
  if(!c.membership?.active||!c.membership?.teamId){
    throw Object.assign(new Error('A commissioner must assign you to a team before you can use team or trade actions.'),{status:403,code:'team-assignment-required'});
  }
  return c.membership.teamId;
}

export function requireDiscordRole(c,roles){
  const allowed=Array.isArray(roles)?roles:[roles];
  if(!c.membership?.active||!allowed.includes(c.membership.role)){
    throw Object.assign(new Error('You do not have permission to use this command.'),{status:403,code:'role-required'});
  }
}

function avatarUrl(identity){
  if(!identity?.avatar)return null;
  const extension=String(identity.avatar).startsWith('a_')?'gif':'png';
  return `https://cdn.discordapp.com/avatars/${identity.id}/${identity.avatar}.${extension}?size=128`;
}

export async function joinDiscordLeague(c,request){
  if(c.membership&&!c.membership.active){
    throw Object.assign(new Error('Your league access was revoked. A commissioner must restore it.'),{status:403,code:'membership-revoked'});
  }
  const identity=c.discordIdentity;
  const username=String(identity.username||'league-member').slice(0,80);
  const globalName=String(identity.global_name||'').trim().slice(0,100)||null;
  const displayName=globalName||username;
  const userId=c.user?.id||createId('user');
  const membershipId=c.membership?.id||createId('membership');
  const membership=c.membership||{id:membershipId,leagueId:c.league.id,leagueSlug:c.league.slug,
    leagueName:c.league.name,role:'team_owner',teamId:null,active:true};
  const session={user:{id:userId},membership};
  const audit=createTenantAuditContext({request},c.league,session,c.membership?'discord_member_refreshed':'discord_member_joined');
  await c.db.batch([
    c.db.prepare(`INSERT INTO users
      (id,discord_user_id,discord_username,discord_global_name,display_name,avatar_hash,avatar_url,created_at,updated_at,last_login_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(discord_user_id) DO UPDATE SET discord_username=excluded.discord_username,
        discord_global_name=excluded.discord_global_name,display_name=excluded.display_name,
        avatar_hash=excluded.avatar_hash,avatar_url=excluded.avatar_url,updated_at=CURRENT_TIMESTAMP`)
      .bind(userId,String(identity.id),username,globalName,displayName,identity.avatar||null,avatarUrl(identity)),
    c.db.prepare(`INSERT OR IGNORE INTO league_memberships
      (id,league_id,user_id,role,team_id,active,created_at,updated_at)
      VALUES (?,?,?,'team_owner',NULL,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`)
      .bind(membershipId,c.league.id,userId),
    tenantAuditStatement(c.db,audit,{resourceType:'league_membership',resourceId:membershipId,
      detail:{source:'discord-command',assignedTeam:false,immediateUnassignedAccess:true}})
  ]);
  return {
    user:{id:userId,discordUserId:String(identity.id),discordUsername:username,discordGlobalName:globalName,displayName,avatarUrl:avatarUrl(identity)},
    membership
  };
}

export async function createInteractionReceipt(db,interaction,{leagueId=null,visibility='private'}={}){
  const user=discordUser(interaction);
  const command=String(interaction?.data?.name||interaction?.type||'unknown').slice(0,100);
  const result=await db.prepare(`INSERT INTO discord_interaction_receipts
    (interaction_id,application_id,discord_guild_id,league_id,discord_user_id,command_name,interaction_type,visibility,status,created_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,? ,CURRENT_TIMESTAMP,datetime('now','+1 day'))
    ON CONFLICT(interaction_id) DO NOTHING`).bind(
      String(interaction.id),String(interaction.application_id||''),interaction.guild_id||null,leagueId,
      user?.id||null,command,Number(interaction.type||0),visibility,'processing'
    ).run();
  return Number(result?.meta?.changes||0)===1;
}

export async function completeInteractionReceipt(db,interactionId,{status='completed',response=null,errorCode=null}={}){
  const digest=response==null?null:await sha256Hex(typeof response==='string'?response:JSON.stringify(response));
  await db.prepare(`UPDATE discord_interaction_receipts SET status=?,response_digest=?,error_code=?,
    completed_at=CURRENT_TIMESTAMP WHERE interaction_id=?`).bind(status,digest,errorCode,String(interactionId)).run();
}

export async function editDiscordOriginalResponse(interaction,message,{fetchImpl=fetch}={}){
  const applicationId=String(interaction.application_id||'');
  const token=String(interaction.token||'');
  if(!SNOWFLAKE.test(applicationId)||!token)throw new Error('Discord response token is unavailable.');
  const response=await fetchImpl(`https://discord.com/api/v10/webhooks/${encodeURIComponent(applicationId)}/${encodeURIComponent(token)}/messages/@original`,{
    method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(discordMessageData(message||'Done.'))
  });
  if(!response.ok)throw new Error(`Discord response update failed with ${response.status}.`);
  return true;
}
