import { discordBotRequest } from './discord-api.js';
import { createTenantAuditContext, tenantAuditStatement } from './tenant-context.js';

// View Channel, Send Messages, Embed Links, Read Message History,
// Manage Channels, Manage Threads, Create Public Threads, Create Private
// Threads, and Send Messages in Threads. The channel permissions let
// onboarding create the schedule workspace and owner-only trade rooms without
// asking commissioners for raw IDs.
export const DISCORD_INSTALL_PERMISSIONS = '395137076240';
const SNOWFLAKE = /^[0-9]{17,20}$/;
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;

export function discordGuildInstallUrl({clientId, redirectUri, state}) {
  if (!SNOWFLAKE.test(String(clientId || ''))) throw new Error('Discord application ID is not configured.');
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', String(clientId));
  url.searchParams.set('redirect_uri', String(redirectUri));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds bot applications.commands');
  url.searchParams.set('permissions', DISCORD_INSTALL_PERMISSIONS);
  url.searchParams.set('integration_type', '0');
  url.searchParams.set('state', String(state));
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export function discordGuildInstallContext(storedStateId) {
  const value = String(storedStateId || '');
  if (!value.startsWith('discordinstall.')) return null;
  return value.split('.')[1] || null;
}

export function discordGuildPermissionAllowsInstall(value) {
  try {
    const permissions = BigInt(String(value || '0'));
    return Boolean((permissions & MANAGE_GUILD) || (permissions & ADMINISTRATOR));
  } catch {
    return false;
  }
}

export async function discordAuthorizedGuild(accessToken, guildId, {fetchImpl = fetch} = {}) {
  const token = String(accessToken || '').trim();
  const selectedGuildId = String(guildId || '').trim();
  if (!token || !SNOWFLAKE.test(selectedGuildId)) return null;
  const response = await fetchImpl('https://discord.com/api/v10/users/@me/guilds?limit=200', {
    headers:{Authorization:`Bearer ${token}`}
  });
  if (!response.ok) {
    throw Object.assign(new Error('Unable to verify Discord server permissions.'), {status:502});
  }
  const guilds = await response.json();
  if (!Array.isArray(guilds)) return null;
  return guilds.find(guild => String(guild?.id || '') === selectedGuildId) || null;
}

function channelName(value) {
  return String(value || '').trim().toLowerCase();
}

export async function discordGuildTextChannels(env, guildId, {fetchImpl = fetch} = {}) {
  if (!SNOWFLAKE.test(String(guildId || ''))) return [];
  const channels = await discordBotRequest(env, `/guilds/${encodeURIComponent(guildId)}/channels`, {fetchImpl});
  return (Array.isArray(channels) ? channels : [])
    .filter(channel => Number(channel?.type) === 0 && SNOWFLAKE.test(String(channel?.id || '')))
    .map(channel => ({id:String(channel.id),name:String(channel.name || 'unnamed-channel').slice(0,100),position:Number(channel.position || 0)}))
    .sort((left,right)=>left.position-right.position||left.name.localeCompare(right.name));
}

export async function discordGuildRoles(env, guildId, {fetchImpl = fetch} = {}) {
  if (!SNOWFLAKE.test(String(guildId || ''))) return [];
  const roles = await discordBotRequest(env, `/guilds/${encodeURIComponent(guildId)}/roles`, {fetchImpl});
  return (Array.isArray(roles) ? roles : [])
    .filter(role => SNOWFLAKE.test(String(role?.id || ''))
      && String(role.id) !== String(guildId)
      && !Boolean(role?.managed)
      && Boolean(role?.mentionable))
    .map(role => ({
      id:String(role.id),
      name:String(role.name || 'unnamed-role').slice(0,100),
      color:Number(role.color || 0),
      position:Number(role.position || 0),
      mentionable:true
    }))
    .sort((left,right)=>right.position-left.position||left.name.localeCompare(right.name));
}

export async function ensureDiscordScheduleChannel(env, guildId, {fetchImpl = fetch} = {}) {
  const channels = await discordGuildTextChannels(env,guildId,{fetchImpl});
  const reusable = channels.find(channel => channelName(channel?.name) === 'franchisehq-schedule');
  if (SNOWFLAKE.test(String(reusable?.id || ''))) return reusable;
  const created = await discordBotRequest(env, `/guilds/${encodeURIComponent(guildId)}/channels`, {
    method:'POST',
    body:{
      name:'franchisehq-schedule',
      type:0,
      topic:'Weekly matchup threads synchronized from the active FranchiseHQ Madden snapshot.'
    },
    fetchImpl
  });
  if (!SNOWFLAKE.test(String(created?.id || ''))) throw new Error('Discord did not return the schedule channel it created.');
  return created;
}

export async function verifyDiscordGuildInstallation(env, guildId, {fetchImpl = fetch} = {}) {
  if (!SNOWFLAKE.test(String(guildId || ''))) throw new Error('Discord did not return a valid server.');
  const guild = await discordBotRequest(env, `/guilds/${encodeURIComponent(guildId)}`, {fetchImpl});
  if (String(guild?.id || '') !== String(guildId)) throw new Error('The FranchiseHQ bot installation could not be verified.');
  return guild;
}

export async function storeDiscordGuildInstallation({
  db,
  env,
  league,
  user,
  guild,
  scheduleChannel,
  request,
  source = 'oauth-connect'
}) {
  const applicationId = String(env?.DISCORD_CLIENT_ID || '').trim();
  const guildId = String(guild?.id || '').trim();
  const channelId = String(scheduleChannel?.id || '').trim();
  if (!SNOWFLAKE.test(applicationId) || !SNOWFLAKE.test(guildId) || !SNOWFLAKE.test(channelId)) {
    throw new Error('The Discord connection response was incomplete.');
  }
  const existing = await db.prepare(`SELECT league_id AS leagueId FROM discord_league_installations
    WHERE discord_guild_id=? AND league_id<>? LIMIT 1`).bind(guildId, league.id).first();
  if (existing) throw Object.assign(new Error('That Discord server is already connected to another FranchiseHQ league.'), {status:409});
  const session = {user, membership:{leagueId:league.id, role:'commissioner', active:true}};
  const audit = createTenantAuditContext({request}, league, session, 'discord_installation_oauth_connected');
  await db.batch([
    db.prepare(`INSERT INTO discord_league_installations
      (id,league_id,discord_guild_id,application_id,guild_name,schedule_channel_id,status,
       connection_source,connected_at,installed_by_user_id,installed_at,updated_at)
      VALUES (?,?,?,?,?,?,'active',?,CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(league_id) DO UPDATE SET
        discord_guild_id=excluded.discord_guild_id,application_id=excluded.application_id,
        guild_name=excluded.guild_name,schedule_channel_id=excluded.schedule_channel_id,
        status='active',connection_source=excluded.connection_source,connected_at=CURRENT_TIMESTAMP,
        installed_by_user_id=excluded.installed_by_user_id,updated_at=CURRENT_TIMESTAMP`)
      .bind(`discord_installation_${crypto.randomUUID()}`,league.id,guildId,applicationId,
        String(guild?.name || 'Discord server').slice(0,100),channelId,source,user.id),
    db.prepare(`UPDATE leagues SET discord_guild_id=?,discord_connected=1,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .bind(guildId,league.id),
    tenantAuditStatement(db,audit,{
      resourceType:'discord_league_installation',resourceId:guildId,
      detail:{source,guildName:String(guild?.name || '').slice(0,100),scheduleChannelId:channelId,
        rawDiscordIdsEntered:false,automaticLeagueBinding:true}
    })
  ]);
  return {guildId,guildName:String(guild?.name || ''),scheduleChannelId:channelId};
}
