const DISCORD_API = 'https://discord.com/api/v10';
const MAX_INLINE_RATE_LIMIT_SECONDS = 15;
const DEFAULT_RATE_LIMIT_RETRIES = 2;

function safeDiscordError(value) {
  return String(value || 'Discord request failed.')
    .replace(/Bot\s+[A-Za-z0-9._-]+/g, 'Bot [redacted]')
    .slice(0, 500);
}

function discordErrorDetail(text) {
  try { return JSON.parse(text || '{}') || {}; }
  catch { return {}; }
}

function discordRetryAfter(response, detail) {
  const values = [
    detail?.retry_after,
    response.headers.get('retry-after'),
    response.headers.get('x-ratelimit-reset-after')
  ].map(Number).filter(value => Number.isFinite(value) && value >= 0);
  return values.length ? Math.max(...values) : null;
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

export async function discordBotRequest(env, path, {
  method = 'GET',
  body = null,
  fetchImpl = fetch,
  rateLimitRetries = DEFAULT_RATE_LIMIT_RETRIES,
  sleepImpl = wait
} = {}) {
  const token = String(env?.DISCORD_BOT_TOKEN || '').trim();
  if (!token) throw new Error('Discord bot delivery is not configured.');
  const retries = Math.max(0, Math.min(5, Number(rateLimitRetries) || 0));
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchImpl(`${DISCORD_API}${path}`, {
      method,
      headers: {
        Authorization:`Bot ${token}`,
        ...(body === null ? {} : {'content-type':'application/json'})
      },
      ...(body === null ? {} : {body:JSON.stringify(body)})
    });
    if (response.ok) {
      if (response.status === 204) return null;
      return response.json();
    }
    const text = await response.text().catch(() => String(response.status));
    const detail = discordErrorDetail(text);
    const retryAfterSeconds = response.status === 429 ? discordRetryAfter(response, detail) : null;
    if (response.status === 429 && attempt < retries && retryAfterSeconds !== null
      && retryAfterSeconds <= MAX_INLINE_RATE_LIMIT_SECONDS) {
      await sleepImpl(Math.ceil(retryAfterSeconds * 1000) + 25);
      continue;
    }
    const error = new Error(`Discord API ${response.status}: ${safeDiscordError(text)}`);
    error.status = response.status;
    error.discordCode = Number.isFinite(Number(detail?.code)) ? Number(detail.code) : null;
    error.retryAfterSeconds = retryAfterSeconds;
    error.rateLimitGlobal = detail?.global === true;
    throw error;
  }
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

export async function reconcileDiscordGlobalCommands(env,commands,{retiredNames=[],fetchImpl=fetch}={}){
  const applicationId=String(env?.DISCORD_CLIENT_ID||'').trim();
  if(!/^[0-9]{17,20}$/.test(applicationId))throw new Error('Discord application ID is not configured.');
  const registered=await upsertDiscordGlobalCommands(env,commands,{fetchImpl});
  const retiredSet=new Set(retiredNames.map(name=>String(name||'').trim().toLowerCase()).filter(Boolean));
  if(!retiredSet.size)return{registered,retired:[]};
  const existing=await discordBotRequest(env,`/applications/${encodeURIComponent(applicationId)}/commands`,{fetchImpl});
  const currentNames=new Set(commands.map(command=>String(command?.name||'').toLowerCase()));
  const retired=(Array.isArray(existing)?existing:[]).filter(command=>
    command?.id&&retiredSet.has(String(command.name||'').toLowerCase())&&!currentNames.has(String(command.name||'').toLowerCase())
  );
  for(const command of retired){
    await discordBotRequest(env,`/applications/${encodeURIComponent(applicationId)}/commands/${encodeURIComponent(command.id)}`,{
      method:'DELETE',fetchImpl
    });
  }
  return{registered,retired:retired.map(command=>({id:command.id,name:command.name}))};
}

export async function ensureDiscordGlobalCommands(env, commands, {fetchImpl = fetch} = {}) {
  const applicationId = String(env?.DISCORD_CLIENT_ID || '').trim();
  if (!/^[0-9]{17,20}$/.test(applicationId)) throw new Error('Discord application ID is not configured.');
  // POST is an idempotent name-based upsert. Reconcile every definition so a
  // changed option schema is repaired as well as a missing command, without
  // using bulk replacement (which could delete legacy scheduler commands).
  return upsertDiscordGlobalCommands(env,commands,{fetchImpl});
}

export async function upsertDiscordGuildCommands(env, guildId, commands, options = {}) {
  if (!/^[0-9]{17,20}$/.test(String(guildId || ''))) throw new Error('Discord server ID is unavailable.');
  return upsertDiscordCommands(env,commands,
    applicationId=>`/applications/${encodeURIComponent(applicationId)}/guilds/${encodeURIComponent(guildId)}/commands`,options);
}

export function discordErrorText(error) {
  return safeDiscordError(error?.message || error);
}
