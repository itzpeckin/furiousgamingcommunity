import { AUTH_CONSTANTS,addSecondsToNow,createRandomToken,createSecureCookie,encodeOpaqueContext,hashToken } from './auth.js';
import { canonicalAuthenticationOrigin,discordRedirectUriForOrigin } from './origin.js';

export async function beginDiscordLink(context,userId) {
  if (!context.env.DISCORD_CLIENT_ID) return null;
  const token = createRandomToken(32);
  const origin = canonicalAuthenticationOrigin(context.request.url);
  const redirectUri = discordRedirectUriForOrigin(context.env,origin);
  const encoded = encodeOpaqueContext({ origin,redirectUri,linkUserId:userId,returnTo:'/account' });
  await context.env.DB.prepare('INSERT INTO oauth_states(id,state_token_hash,expires_at) VALUES (?,?,?)')
    .bind('oauthctx.'+encoded+'.'+crypto.randomUUID(),await hashToken(token),addSecondsToNow(600)).run();
  const url = new URL('https://discord.com/oauth2/authorize');
  for (const [key,value] of Object.entries({ client_id:context.env.DISCORD_CLIENT_ID,redirect_uri:redirectUri,response_type:'code',scope:'identify',state:token,prompt:'consent' })) url.searchParams.set(key,value);
  return { redirectUrl:url.toString(),cookie:createSecureCookie(AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME,token,600,'/') };
}

export async function finishDiscordLink(db,{userId,discordId,stateId}) {
  if (!/^\d{17,20}$/.test(String(discordId))) return false;
  const existing = await db.prepare(`SELECT user_id,provider_subject FROM user_auth_identities
    WHERE provider='discord' AND (user_id=? OR provider_subject=?)`).bind(userId,discordId).all();
  if ((existing?.results || []).some(row => row.user_id !== userId || row.provider_subject !== discordId)) return false;
  const active = `EXISTS (SELECT 1 FROM oauth_states WHERE id=? AND used_at IS NULL AND datetime(expires_at)>CURRENT_TIMESTAMP)`;
  try {
    const results = await db.batch([
      db.prepare(`INSERT INTO user_auth_identities(id,user_id,provider,provider_subject,email_verified)
        SELECT ?,?,'discord',?,1 WHERE ${active}
        AND NOT EXISTS (SELECT 1 FROM user_auth_identities WHERE user_id=? AND provider='discord')`)
        .bind('identity_'+crypto.randomUUID(),userId,discordId,stateId,userId),
      db.prepare(`UPDATE users SET discord_user_id=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND ${active} AND EXISTS (SELECT 1 FROM user_auth_identities WHERE user_id=? AND provider='discord' AND provider_subject=?)`)
        .bind(discordId,userId,stateId,userId,discordId),
      db.prepare(`UPDATE oauth_states SET used_at=CURRENT_TIMESTAMP WHERE id=? AND used_at IS NULL
        AND datetime(expires_at)>CURRENT_TIMESTAMP
        AND EXISTS (SELECT 1 FROM user_auth_identities WHERE user_id=? AND provider='discord' AND provider_subject=?)`)
        .bind(stateId,userId,discordId)
    ]);
    return Number(results[2]?.meta?.changes) === 1;
  } catch(error) {
    if (String(error?.message || '').includes('UNIQUE constraint')) return false;
    throw error;
  }
}
