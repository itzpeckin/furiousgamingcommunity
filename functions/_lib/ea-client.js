// Madden protocol interoperability. Account secrets are supplied by deployment bindings.
const ACCOUNT_ORIGIN = 'https://accounts.ea.com';
const IDENTITY_ORIGIN = 'https://gateway.ea.com';
const MADDEN_ORIGIN = 'https://wal2.tools.gos.bio-iad.ea.com';
const CALLBACK_URL = 'http://127.0.0.1/success';
const MACHINE_KEY = '444d362e8e067fe2';
const AUTH_SOURCE = '317239';
const USER_AGENT = 'Dalvik/2.1.0 (Linux; U; Android 13; sdk_gphone_x86_64 Build/TE1A.220922.031)';
const BROWSER_AGENT = 'Mozilla/5.0 (Linux; Android 13; sdk_gphone_x86_64 Build/TE1A.220922.031; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/103.0.5060.71 Mobile Safari/537.36';
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const PLATFORMS = Object.freeze({ xone: 'xbox', ps4: 'ps3', pc: 'cem_ea_id', ps5: 'ps3', xbsx: 'xbox' });
const DATASETS = Object.freeze({
  teams: ['CareerMode_GetLeagueTeamsExport', 'leagueTeamInfoList'],
  standings: ['CareerMode_GetStandingsExport', 'teamStandingInfoList'],
  schedules: ['CareerMode_GetWeeklySchedulesExport', 'gameScheduleInfoList'],
  passing: ['CareerMode_GetWeeklyPassingStatsExport', 'playerPassingStatInfoList'],
  rushing: ['CareerMode_GetWeeklyRushingStatsExport', 'playerRushingStatInfoList'],
  receiving: ['CareerMode_GetWeeklyReceivingStatsExport', 'playerReceivingStatInfoList'],
  defense: ['CareerMode_GetWeeklyDefensiveStatsExport', 'playerDefensiveStatInfoList'],
  kicking: ['CareerMode_GetWeeklyKickingStatsExport', 'playerKickingStatInfoList'],
  punting: ['CareerMode_GetWeeklyPuntingStatsExport', 'playerPuntingStatInfoList'],
  teamstats: ['CareerMode_GetWeeklyTeamStatsExport', 'teamStatInfoList'],
  roster: ['CareerMode_GetTeamRostersExport', 'rosterInfoList'],
  freeagents: ['CareerMode_GetTeamRostersExport', 'rosterInfoList']
});
const REQUEST_STEPS = Object.freeze({
  'account-token': 'EA sign-in token', 'account-identity': 'EA account lookup',
  'game-entitlements': 'Madden ownership check', 'player-profiles': 'Madden profile lookup',
  'profile-authorize': 'EA profile authorization', 'profile-token': 'EA profile token',
  'token-refresh': 'EA connection renewal', 'madden-login': 'Madden service sign-in',
  'franchise-list': 'Madden franchise lookup', 'league-hub': 'Madden league information',
  'league-data': 'Madden league data'
});
// Never echo arbitrary EA error strings, numeric identifiers, or response text.
const PROVIDER_CODES = new Set(['INVALID_GRANT', 'INVALID_TOKEN', 'INVALID_REQUEST', 'INVALID_CLIENT',
  'ACCESS_DENIED', 'UNAUTHORIZED_CLIENT', 'UNSUPPORTED_GRANT_TYPE', 'SERVER_ERROR', 'TEMPORARILY_UNAVAILABLE',
  'ERR_TIMEOUT', 'ERR_SYSTEM', 'ERR_AUTHENTICATION_REQUIRED', 'ERR_INVALID_SESSION', 'ERR_DISCONNECTED',
  'AUTH_ERR_INVALID_TOKEN', 'AUTH_ERR_INVALID_REQUEST', 'AUTH_ERR_INVALID_USER']);
function providerCode(value) {
  return typeof value === 'string' && PROVIDER_CODES.has(value.toUpperCase()) ? value.toUpperCase() : null;
}

export class EaClientError extends Error {
  constructor(code, message, { status = 502, retryable = false } = {}) {
    super(message);
    this.name = 'EaClientError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

export function safeEaClientDiagnostic(error) {
  if (!(error instanceof EaClientError) || !Object.hasOwn(REQUEST_STEPS, error.diagnostic?.step)) return null;
  const { step, httpStatus } = error.diagnostic;
  return { step, stepLabel: REQUEST_STEPS[step],
    httpStatus: Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? httpStatus : null,
    providerCode: providerCode(error.diagnostic.providerCode) };
}

function requestError(error, step, httpStatus = null) {
  const safe = error instanceof EaClientError ? error
    : new EaClientError('EA_CONNECTION_FAILED', 'FranchiseHQ could not connect to EA. Try again later.', { status: 503, retryable: true });
  if (!safeEaClientDiagnostic(safe) && Object.hasOwn(REQUEST_STEPS, step)) {
    safe.diagnostic = { step, httpStatus, providerCode: providerCode(safe.diagnostic?.providerCode) };
  }
  return safe;
}

function invalidInput() {
  return new EaClientError('EA_INVALID_REQUEST', 'The EA connection request is invalid.', { status: 400 });
}

function integer(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'number' && typeof value !== 'string') throw invalidInput();
  if (typeof value === 'string' && !/^\d+$/.test(value)) throw invalidInput();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) throw invalidInput();
  return number;
}

function textValue(value, max = 16384) {
  if (typeof value !== 'string' || !value.length || value.length > max || /[\u0000-\u0020\u007f]/.test(value)) throw invalidInput();
  return value;
}

function platformValue(value) {
  if (!Object.hasOwn(PLATFORMS, value)) throw invalidInput();
  return value;
}

function sessionPath(value) {
  const key = textValue(value, 2048);
  // Blaze consumes the opaque key in the path as supplied by login. Encoding
  // path-safe punctuation (notably +, = and :) changes that credential.
  // Restrict it to one literal RFC 3986 path segment, with no URL delimiters,
  // escapes or dot-segment normalization.
  if (!/^[A-Za-z0-9_~.!$&'()*+,;=:@-]+$/.test(key) || key === '.' || key === '..') throw invalidInput();
  return key;
}

export function makeEaLoginUrl(env = {}, state = '') {
  const edition = integer(env.EA_EDITION || 2027, 2026, 2100);
  const url = new URL(`${ACCOUNT_ORIGIN}/connect/auth`);
  const parameters = { hide_create: 'true', release_type: 'prod', response_type: 'code', redirect_uri: CALLBACK_URL, client_id: textValue(env.EA_CLIENT_ID || `MCA_${String(edition).slice(-2)}_COMP_APP`, 128), machineProfileKey: MACHINE_KEY, authentication_source: AUTH_SOURCE };
  if (state) parameters.state = textValue(state, 256);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

function bytesFromHex(value) {
  return Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));
}

function joinBytes(...parts) {
  const result = new Uint8Array(parts.reduce((size, part) => size + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function base64(bytes) {
  return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
}

async function messageAuth(session, cryptoImpl) {
  const requestId = integer(session.requestId, 1, Number.MAX_SAFE_INTEGER - 1);
  const blazeId = integer(session.blazeId, 1);
  // Reserve before awaiting so concurrent commands never share a request id.
  session.requestId = requestId + 1;
  const nonce = cryptoImpl.getRandomValues(new Uint8Array(4));
  // MD5 is mandated by EA's message format; it is not used for FHQ credential storage.
  const mask = new Uint8Array(await cryptoImpl.subtle.digest('MD5', joinBytes(nonce, bytesFromHex('634203362017bf72f70ba900c0aa4e6b'))));
  const payload = new TextEncoder().encode(JSON.stringify({ staticData: '05e6a7ead5584ab4', requestId, blazeId }));
  const masked = payload.map((byte, index) => byte ^ mask[index % mask.length]);
  const packed = joinBytes(nonce, masked);
  const digest = new Uint8Array(await cryptoImpl.subtle.digest('MD5', joinBytes(bytesFromHex('3a53413521464c3b6531326530705b70203a2900'), packed)));
  return { authData: base64(packed), authCode: base64(digest), authType: 17039361 };
}

function providerError(value, status = 502) {
  const description = [value?.error?.errorname, value?.error, value?.error_description, value?.message, value?.responseInfo?.value?.message, value?.error?.errordf?.errorString, value?.error?.errortdf?.errorString].filter(part => typeof part === 'string').join(' ').toUpperCase();
  let error;
  if (status === 401 || /INVALID_GRANT|INVALID_TOKEN|AUTH_REQUIRED|INVALID_SESSION|SESSION_EXPIRED|AUTHENTICATION_REQUIRED/.test(description)) {
    error = new EaClientError('EA_RECONNECT_REQUIRED', 'EA needs you to reconnect your account.', { status: 401 });
  } else if (status === 429 || /TIMEOUT|BUSY|HIGH SERVER LOAD|MODE.*DISABLED|UNAVAILABLE|RATE_LIMIT/.test(description)) {
    error = new EaClientError('EA_TEMPORARILY_UNAVAILABLE', 'EA could not provide this data right now. Try again later.', { status: 503, retryable: true });
  } else {
    error = new EaClientError('EA_REQUEST_FAILED', 'EA did not accept this request. Your current league data is unchanged.', { retryable: status >= 500 });
  }
  error.diagnostic = { providerCode: providerCode(value?.error?.errorname) || providerCode(value?.error) };
  return error;
}

function validTarget(url) {
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
  if (url.origin === ACCOUNT_ORIGIN) return ['/connect/token', '/connect/tokeninfo', '/connect/auth'].includes(url.pathname);
  if (url.origin === IDENTITY_ORIGIN) return /^\/proxy\/identity\/pids\/\d+\/(?:entitlements\/|personas)$/.test(url.pathname);
  if (url.origin === MADDEN_ORIGIN) {
    if (url.pathname === '/wal/authentication/login') return true;
    return /^\/wal\/mca\/(?:Process|CareerMode_Get(?:LeagueTeams|Standings|WeeklySchedules|WeeklyPassingStats|WeeklyRushingStats|WeeklyReceivingStats|WeeklyDefensiveStats|WeeklyKickingStats|WeeklyPuntingStats|WeeklyTeamStats|TeamRosters)Export)\/[^/]+$/.test(url.pathname);
  }
  return false;
}

async function boundedJson(response) {
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new EaClientError('EA_RESPONSE_TOO_LARGE', 'EA returned more data than this request can safely process.');
  }
  if (!response.body) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned an incomplete response.');
  const reader = response.body.getReader();
  let bytes = new Uint8Array(65536);
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new EaClientError('EA_RESPONSE_TOO_LARGE', 'EA returned more data than this request can safely process.');
      }
      if (size + value.byteLength > bytes.byteLength) {
        const expanded = new Uint8Array(Math.min(MAX_RESPONSE_BYTES, Math.max(bytes.byteLength * 2, size + value.byteLength)));
        expanded.set(bytes.subarray(0, size));
        bytes = expanded;
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally { reader.releaseLock(); }
  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
    const parsed = JSON.parse(raw.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, ''));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('shape');
    return parsed;
  } catch {
    throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned data that could not be read.');
  }
}

/** EA indexes are zero-based. Callers retain the raw response and apply FHQ period mapping separately. */
export function createEaClient(env, { fetchImpl = fetch, cryptoImpl = crypto, timeoutMs = 20000 } = {}) {
  const edition = integer(env?.EA_EDITION || 2027, 2026, 2100);
  const clientId = textValue(env?.EA_CLIENT_ID || `MCA_${String(edition).slice(-2)}_COMP_APP`, 128);
  const deadline = integer(timeoutMs, 1, 30000);
  const commonHeaders = { Accept: 'application/json', 'Accept-Charset': 'UTF-8', 'User-Agent': USER_AGENT };

  async function request(urlValue, options = {}, { redirectCode = false, step, validate } = {}) {
    const url = new URL(urlValue);
    if (!validTarget(url)) throw invalidInput();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadline);
    let httpStatus = null;
    try {
      const response = await fetchImpl(url.toString(), { ...options, headers: { ...commonHeaders, ...options.headers }, redirect: 'manual', signal: controller.signal });
      httpStatus = response.status;
      if (redirectCode && [301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        let callback;
        try { callback = new URL(location); } catch { throw invalidInput(); }
        if (callback.origin !== 'http://127.0.0.1' || callback.pathname !== '/success' || callback.username || callback.password || callback.hash) throw invalidInput();
        return { code: textValue(callback.searchParams.get('code'), 4096) };
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new EaClientError('EA_UNEXPECTED_REDIRECT', 'EA returned an unexpected sign-in response. Reconnect your account.');
      }
      if (!response.ok) {
        let failure = null;
        try { failure = await boundedJson(response); } catch (error) {
          if (error.code === 'EA_RESPONSE_TOO_LARGE' || controller.signal.aborted) throw error;
        }
        throw providerError(failure, response.status);
      }
      const result = await boundedJson(response);
      if (result.error || result.success === false || result.responseInfo?.value?.success === false) throw providerError(result);
      if (validate) validate(result);
      return result;
    } catch (error) {
      const failure = controller.signal.aborted && !(error instanceof EaClientError)
        ? new EaClientError('EA_TIMEOUT', 'EA took too long to respond. Try again later.', { status: 504, retryable: true }) : error;
      throw requestError(failure, step, httpStatus);
    } finally { clearTimeout(timer); }
  }

  function tokenResult(result, existing = {}) {
    if (!result.access_token || !result.refresh_token || !Number.isFinite(Number(result.expires_in)) || Number(result.expires_in) <= 0) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned an incomplete account connection.');
    return { ...existing, accessToken: textValue(result.access_token), refreshToken: textValue(result.refresh_token), expiresAt: new Date(Date.now() + Math.min(Number(result.expires_in), 31536000) * 1000).toISOString() };
  }

  async function tokenGrant(parameters, step) {
    if (!env?.EA_CLIENT_SECRET) throw new EaClientError('EA_NOT_CONFIGURED', 'EA Direct has not been configured for this platform.', { status: 503 });
    const body = new URLSearchParams({ authentication_source: AUTH_SOURCE, client_id: clientId, client_secret: textValue(env.EA_CLIENT_SECRET), release_type: 'prod', ...parameters });
    return request(`${ACCOUNT_ORIGIN}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' }, body: body.toString() }, { step, validate: result => tokenResult(result) });
  }

  function maddenHeaders(platform) {
    return { 'Content-Type': 'application/json', 'X-BLAZE-ID': `madden-${edition}-${platformValue(platform)}`, 'X-BLAZE-VOID-RESP': 'XML', 'X-Application-Key': 'MADDEN-MCA' };
  }

  async function command(token, session, platform, commandName, commandId, payload, step, validate) {
    textValue(token?.accessToken);
    const sessionKey = sessionPath(session?.sessionKey);
    const auth = await messageAuth(session, cryptoImpl);
    const requestInfo = { commandName, componentId: 2060, commandId, componentName: 'franchisemode', messageAuthData: auth, messageExpirationTime: Math.floor(Date.now() / 1000), deviceId: MACHINE_KEY, ipAddress: '127.0.0.1', requestPayload: JSON.stringify(payload) };
    const result = await request(`${MADDEN_ORIGIN}/wal/mca/Process/${sessionKey}`, { method: 'POST', headers: maddenHeaders(platform), body: JSON.stringify({ apiVersion: 2, clientDevice: 3, requestInfo: JSON.stringify(requestInfo) }) }, { step, validate: result => {
      if (!result.responseInfo?.value || typeof result.responseInfo.value !== 'object') throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned incomplete franchise details.');
      if (validate) validate(result.responseInfo.value);
    } });
    return result.responseInfo.value;
  }

  const renewals = new WeakMap();
  const rejectedSession = error => error instanceof EaClientError
    && ['ERR_AUTHENTICATION_REQUIRED', 'ERR_INVALID_SESSION'].includes(safeEaClientDiagnostic(error)?.providerCode);
  async function withMaddenSession(token, session, platform, operation) {
    const originalKey = session?.sessionKey;
    try { return await operation(); } catch (error) {
      if (!rejectedSession(error)) throw error;
    }
    // Concurrent reads share one renewal. An EA account-token rejection still
    // propagates normally; a Blaze rejection alone does not expire OAuth.
    if (session.sessionKey === originalKey) {
      let renewal = renewals.get(session);
      if (!renewal) {
        renewal = methods.login(token, platform).then(fresh => {
          Object.assign(session, fresh, { requestId: Math.max(session.requestId, fresh.requestId) });
        }).finally(() => renewals.delete(session));
        renewals.set(session, renewal);
      }
      await renewal;
    }
    try { return await operation(); } catch (error) {
      if (!rejectedSession(error)) throw error;
      const failure = new EaClientError('EA_MADDEN_SESSION_REJECTED',
        'EA accepted your sign-in but rejected the renewed Madden session. Try this step again later. Your league data is unchanged.',
        { status: 424, retryable: true });
      failure.diagnostic = safeEaClientDiagnostic(error);
      throw failure;
    }
  }

  const methods = {
    async exchangeCode(code) {
      // EA's account token uses its default format. JWS is requested only after
      // selecting a persona, and when renewing that persona-scoped connection.
      return tokenResult(await tokenGrant({ grant_type: 'authorization_code', code: textValue(code, 4096), redirect_uri: CALLBACK_URL }, 'account-token'));
    },
    async personas(accessToken) {
      const token = textValue(accessToken);
      const infoUrl = new URL(`${ACCOUNT_ORIGIN}/connect/tokeninfo`);
      infoUrl.searchParams.set('access_token', token);
      const info = await request(infoUrl, { headers: { 'X-Include-Deviceid': 'true' } }, { step: 'account-identity', validate: value => integer(value.pid_id, 1) });
      const pid = integer(info.pid_id, 1);
      const identityHeaders = { Authorization: `Bearer ${token}`, 'X-Expand-Results': 'true' };
      const entitlements = await request(`${IDENTITY_ORIGIN}/proxy/identity/pids/${pid}/entitlements/?status=ACTIVE`, { headers: identityHeaders }, { step: 'game-entitlements', validate: value => {
        if (!Array.isArray(value.entitlements?.entitlement)) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned incomplete game ownership details.');
      } });
      const rows = entitlements.entitlements?.entitlement;
      if (!Array.isArray(rows)) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned incomplete game ownership details.');
      const choices = [];
      const seen = new Set();
      for (const platform of Object.keys(PLATFORMS)) {
        const entitlement = `MADDEN_${String(edition).slice(-2)}${platform.toUpperCase()}`;
        const matches = rows.filter(row => row?.groupName === entitlement && row.entitlementTag === 'ONLINE_ACCESS' && (!row.status || row.status === 'ACTIVE'));
        for (const entry of matches.slice(0, 10)) {
          // EA supplies pidUri; accept only a numeric account path, never an arbitrary URL.
          const match = /^\/pids\/(\d+)$/.exec(String(entry.pidUri || `/pids/${pid}`));
          if (!match) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned an invalid account reference.');
          const accountId = integer(match[1], 1);
          const personaUrl = new URL(`${IDENTITY_ORIGIN}/proxy/identity/pids/${accountId}/personas`);
          personaUrl.searchParams.set('status', 'ACTIVE');
          personaUrl.searchParams.set('access_token', token);
          const result = await request(personaUrl, { headers: identityHeaders }, { step: 'player-profiles', validate: value => {
            if (!Array.isArray(value.personas?.persona)) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned incomplete player profiles.');
          } });
          if (!Array.isArray(result.personas?.persona)) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned incomplete player profiles.');
          for (const row of result.personas.persona) {
            if (row?.namespaceName !== PLATFORMS[platform] || (row.status && row.status !== 'ACTIVE')) continue;
            const id = String(integer(row.personaId, 1));
            const key = `${platform}:${id}`;
            if (seen.has(key)) continue;
            seen.add(key);
            choices.push({ id, name: String(row.displayName || row.name || 'EA player').slice(0, 100), namespace: PLATFORMS[platform], platform, entitlement });
          }
        }
      }
      return choices;
    },
    async personaToken(accessToken, persona) {
      const platform = platformValue(persona?.platform);
      if (persona.namespace !== PLATFORMS[platform] || persona.entitlement !== `MADDEN_${String(edition).slice(-2)}${platform.toUpperCase()}`) throw invalidInput();
      const url = new URL(`${ACCOUNT_ORIGIN}/connect/auth`);
      const parameters = { hide_create: 'true', release_type: 'prod', response_type: 'code', redirect_uri: CALLBACK_URL, client_id: clientId, machineProfileKey: MACHINE_KEY, authentication_source: AUTH_SOURCE, access_token: textValue(accessToken), persona_id: String(integer(persona.id, 1)), persona_namespace: persona.namespace };
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      const { code } = await request(url, { headers: { Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'User-Agent': BROWSER_AGENT, 'X-Requested-With': 'com.ea.gp.madden19companionapp', 'Upgrade-Insecure-Requests': '1', 'Accept-Language': 'en-US,en;q=0.9', 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-User': '?1', 'Sec-Fetch-Dest': 'document' } }, { redirectCode: true, step: 'profile-authorize' });
      return tokenResult(await tokenGrant({ grant_type: 'authorization_code', code: textValue(code, 4096), redirect_uri: CALLBACK_URL, token_format: 'JWS' }, 'profile-token'));
    },
    async refresh(token) {
      return tokenResult(await tokenGrant({ grant_type: 'refresh_token', refresh_token: textValue(token?.refreshToken), token_format: 'JWS' }, 'token-refresh'), token);
    },
    async login(token, platform) {
      const result = await request(`${MADDEN_ORIGIN}/wal/authentication/login`, { method: 'POST', headers: maddenHeaders(platform), body: JSON.stringify({ accessToken: textValue(token?.accessToken), productName: `madden-${edition}-${platformValue(platform)}-mca` }) }, { step: 'madden-login', validate: value => {
        if (!value.userLoginInfo?.sessionKey || !value.userLoginInfo?.personaDetails?.personaId) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned an incomplete Madden session.');
      } });
      const info = result.userLoginInfo;
      if (!info?.sessionKey || !info?.personaDetails?.personaId) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned an incomplete Madden session.');
      return { sessionKey: sessionPath(info.sessionKey), blazeId: integer(info.personaDetails.personaId, 1), requestId: 1 };
    },
    async leagues(token, session, platform) {
      const result = await withMaddenSession(token, session, platform, () => command(token, session, platform, 'Mobile_GetMyLeagues', 801, {}, 'franchise-list', value => {
        if (!Array.isArray(value.leagues)) throw new EaClientError('EA_INVALID_RESPONSE', 'EA returned an incomplete franchise list.');
      }));
      return result.leagues;
    },
    async hub(token, session, platform, leagueId) {
      return withMaddenSession(token, session, platform, () => command(token, session, platform, 'Mobile_Career_GetLeagueHub', 811, { leagueId: integer(leagueId, 1) }, 'league-hub'));
    },
    async dataset(token, session, platform, leagueId, kind, args = {}) {
      if (!Object.hasOwn(DATASETS, kind)) throw invalidInput();
      textValue(token?.accessToken);
      const [endpoint, collection] = DATASETS[kind];
      const payload = { leagueId: integer(leagueId, 1) };
      if (kind === 'freeagents') Object.assign(payload, { listIndex: -1, returnFreeAgents: true, teamId: 0 });
      else if (kind === 'roster') Object.assign(payload, { listIndex: integer(args.listIndex, 0, 31), returnFreeAgents: false, teamId: integer(args.teamId, 1) });
      else if (!['teams', 'standings'].includes(kind)) {
        payload.stageIndex = integer(args.stageIndex, 0, 1);
        payload.weekIndex = integer(args.weekIndex, 0, payload.stageIndex === 0 ? 3 : 22);
      }
      const result = await withMaddenSession(token, session, platform, () => request(`${MADDEN_ORIGIN}/wal/mca/${endpoint}/${sessionPath(session?.sessionKey)}`, { method: 'POST', headers: maddenHeaders(platform), body: JSON.stringify(payload) }, { step: 'league-data', validate: value => {
        if (value.success !== true || !Array.isArray(value[collection])) throw new EaClientError('EA_INCOMPLETE_DATASET', 'EA did not provide a complete dataset. Try again later.', { retryable: true });
      } }));
      // An unavailable roster or Free Agent request must never become an empty list.
      if (result.success !== true || !Array.isArray(result[collection])) throw new EaClientError('EA_INCOMPLETE_DATASET', 'EA did not provide a complete dataset. Try again later.', { retryable: true });
      return result;
    }
  };
  const methodSteps = { exchangeCode: 'account-token', personas: 'player-profiles', personaToken: 'profile-authorize',
    refresh: 'token-refresh', login: 'madden-login', leagues: 'franchise-list', hub: 'league-hub', dataset: 'league-data' };
  return Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, async (...args) => {
    try { return await method(...args); } catch (error) { throw requestError(error, methodSteps[name]); }
  }]));
}
