const DISCORD_API = 'https://discord.com/api/v10';

function safeDiscordError(value) {
  return String(value || 'Discord request failed.')
    .replace(/Bot\s+[A-Za-z0-9._-]+/g, 'Bot [redacted]')
    .slice(0, 500);
}

export async function discordBotRequest(env, path, {
  method = 'GET',
  body = null,
  fetchImpl = fetch
} = {}) {
  const token = String(env?.DISCORD_BOT_TOKEN || '').trim();
  if (!token) throw new Error('Discord bot delivery is not configured.');
  const response = await fetchImpl(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization:`Bot ${token}`,
      ...(body === null ? {} : {'content-type':'application/json'})
    },
    ...(body === null ? {} : {body:JSON.stringify(body)})
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => String(response.status));
    const error = new Error(`Discord API ${response.status}: ${safeDiscordError(detail)}`);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

async function upsertDiscordCommands(env, commands, path, {fetchImpl = fetch} = {}) {
  const applicationId = String(env?.DISCORD_CLIENT_ID || '').trim();
  if (!/^[0-9]{17,20}$/.test(applicationId)) {
    throw new Error('Discord application ID is not configured.');
  }
  const registered = [];
  for (const command of commands) {
    // Discord treats POST by command name as an upsert. Unlike bulk PUT, this
    // cannot delete an existing scheduler command that is absent from this list.
    registered.push(await discordBotRequest(env, path(applicationId), {
      method:'POST', body:command, fetchImpl
    }));
  }
  return registered;
}

export async function upsertDiscordGlobalCommands(env, commands, options = {}) {
  return upsertDiscordCommands(env,commands,
    applicationId=>`/applications/${encodeURIComponent(applicationId)}/commands`,options);
}

export async function ensureDiscordGlobalCommands(env, commands, {fetchImpl = fetch} = {}) {
  const applicationId = String(env?.DISCORD_CLIENT_ID || '').trim();
  if (!/^[0-9]{17,20}$/.test(applicationId)) throw new Error('Discord application ID is not configured.');
  const existing = await discordBotRequest(env,
    `/applications/${encodeURIComponent(applicationId)}/commands`,{fetchImpl});
  const names = new Set((Array.isArray(existing) ? existing : []).map(command=>String(command?.name || '').toLowerCase()));
  const missing = commands.filter(command=>!names.has(String(command?.name || '').toLowerCase()));
  return upsertDiscordGlobalCommands(env,missing,{fetchImpl});
}

export async function upsertDiscordGuildCommands(env, guildId, commands, options = {}) {
  if (!/^[0-9]{17,20}$/.test(String(guildId || ''))) throw new Error('Discord server ID is unavailable.');
  return upsertDiscordCommands(env,commands,
    applicationId=>`/applications/${encodeURIComponent(applicationId)}/guilds/${encodeURIComponent(guildId)}/commands`,options);
}

export function discordErrorText(error) {
  return safeDiscordError(error?.message || error);
}
