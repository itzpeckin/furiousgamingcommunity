import {
  AUTH_CONSTANTS,
  addSecondsToNow,
  createRandomToken,
  createSecureCookie,
  encodeOpaqueContext,
  hashToken,
  jsonResponse,
  redirectResponse
} from '../../../../_lib/auth.js';
import { database, normalizeLeagueSlug, resolveLeague, validLeagueSlug } from '../../../../_lib/cloud-platform.js';
import { discordGuildInstallUrl } from '../../../../_lib/discord-installation.js';
import { canonicalAuthenticationOrigin, discordRedirectUriForOrigin } from '../../../../_lib/origin.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE = '7.5.5.7';

export async function onRequestGet(context) {
  try {
    const authorization = await requireCommissioner(context);
    if (!authorization.authorized) return authorization.response;
    const slug = normalizeLeagueSlug(context);
    if (!validLeagueSlug(slug)) return jsonResponse({ok:false,error:'Invalid league slug.',release:RELEASE},400);
    const db = database(context.env);
    const league = db ? await resolveLeague(context.env, slug) : null;
    if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
      return jsonResponse({ok:false,error:'Not found.',release:RELEASE},404);
    }
    if (!context.env.DISCORD_CLIENT_ID || !context.env.DISCORD_CLIENT_SECRET || !context.env.DISCORD_BOT_TOKEN) {
      return jsonResponse({ok:false,error:'Discord connection is not configured in Production.',release:RELEASE},503);
    }

    const requestUrl = new URL(context.request.url);
    const origin = canonicalAuthenticationOrigin(requestUrl);
    const redirectUri = discordRedirectUriForOrigin(context.env, origin);
    const stateToken = createRandomToken(32);
    const stateTokenHash = await hashToken(stateToken);
    const installContext = encodeOpaqueContext({
      kind:'discord-install',
      origin,
      redirectUri,
      leagueId:league.id,
      leagueSlug:league.slug,
      userId:authorization.session.user.id,
      returnTo:`/leagues/${league.slug}?discord=connected#commissioner`
    });
    const stateId = `discordinstall.${installContext}.${crypto.randomUUID()}`;
    await db.prepare(`INSERT INTO oauth_states (id,state_token_hash,expires_at) VALUES (?,?,?)`)
      .bind(stateId,stateTokenHash,addSecondsToNow(AUTH_CONSTANTS.OAUTH_STATE_DURATION_SECONDS)).run();
    const location = discordGuildInstallUrl({
      clientId:context.env.DISCORD_CLIENT_ID,
      redirectUri,
      state:stateToken
    });
    return redirectResponse(location,{
      'Set-Cookie':createSecureCookie(
        AUTH_CONSTANTS.OAUTH_STATE_COOKIE_NAME,
        stateToken,
        AUTH_CONSTANTS.OAUTH_STATE_DURATION_SECONDS,
        '/'
      )
    });
  } catch (error) {
    console.error('Discord connection start failed:', String(error?.message || error).slice(0,500));
    return jsonResponse({ok:false,error:'Unable to begin the Discord connection.',release:RELEASE},Number(error?.status)||500);
  }
}
