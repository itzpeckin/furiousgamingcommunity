import { EaClientError } from './ea-client.js';
import { normalizeEaHub, eaCapturePlan, beginEaCapture, storeEaCapture, finalizeEaCapture } from './ea-capture.js';

const MAX_REQUESTS = 100;
const MODES = ['preview', 'weekly', 'yearly'];
const adapter = { normalizeEaHub, eaCapturePlan, beginEaCapture, storeEaCapture, finalizeEaCapture };

function collectionError(code, message) {
  return new EaClientError(code, message, { status: 409 });
}

function assertScope(league, connection, job, state) {
  if (!league?.id || connection?.league_id !== league.id || job?.league_id !== league.id
    || job.connection_id !== connection.id || !MODES.includes(job.mode)
    || !/^\d+$/.test(String(connection.external_league_id || '')) || !job.id) {
    throw collectionError('EA_COLLECTION_SCOPE', 'This EA collection does not belong to the selected league.');
  }
  if (state.initialized && (state.collectionId !== job.id || state.connectionId !== connection.id
    || state.externalLeagueId !== String(connection.external_league_id) || state.platform !== connection.platform
    || state.mode !== job.mode)) {
    throw collectionError('EA_COLLECTION_SCOPE', 'The EA connection changed during collection. Start a fresh sync.');
  }
}

function describe(item) {
  if (!item) return 'Verifying the completed collection';
  if (item.kind === 'teams') return 'Collecting league teams';
  if (item.kind === 'standings') return 'Collecting standings';
  if (item.kind === 'roster') return `Collecting roster ${item.args.listIndex + 1} of 32`;
  if (item.kind === 'free-agents') return 'Collecting Free Agents';
  const week = Number(item.args.weekIndex) + 1;
  return item.kind === 'schedule' ? `Collecting Week ${week} schedule` : `Collecting Week ${week} ${item.args.category} statistics`;
}

function checkpoint(state) {
  return { state, done: false, result: null, step: describe(state.expectedRequests?.[state.cursor]), progress: Math.min(95, Math.floor(95 * state.cursor / state.expectedRequests.length)) };
}

function comparableHub(hub) {
  return `${hub.gameRelease}:${hub.sourceSeasonId}:${hub.seasonYear}:${hub.currentPeriod.key}`;
}

function checkedHub(capture, rawHub) {
  try { return capture.normalizeEaHub(rawHub); } catch (cause) {
    const hub=rawHub?.responseInfo?.value || rawHub;
    if (hub?.careerHubInfo?.isLeagueAdvancing) {
      throw collectionError('EA_CURRENT_PERIOD_UNAVAILABLE', 'EA reports that the league is advancing. Try again after the advance finishes.');
    }
    const error=collectionError('EA_CURRENT_PERIOD_UNAVAILABLE', 'FHQ could not verify the current season and week from EA league information. Your live league data has not changed.');
    const reasons={
      'EA did not provide a valid export week.':'invalid-export-week',
      'EA current-period evidence is invalid.':'invalid-current-period',
      'EA current week does not agree with its available export weeks.':'native-week-mismatch',
      'EA has not identified one current export week; sync is paused until the hub identifies it.':'current-week-unidentified',
      'EA has not provided an exact franchise season identifier.':'season-unidentified'
    };
    const season=hub?.careerHubInfo?.seasonInfo || hub?.seasonInfo || hub || {};
    const numeric=value=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<=9999?value:null;
    // Only fixed field names, bounded numbers and booleans. No provider strings,
    // account identifiers, session material or raw response is retained here.
    error.periodDiagnostic={reason:reasons[cause?.message]||'unsupported-hub-shape',
      careerHubPresent:Boolean(hub?.careerHubInfo),seasonInfoPresent:Boolean(hub?.careerHubInfo?.seasonInfo||hub?.seasonInfo),
      ...Object.fromEntries(['seasonYear','calendarYear','seasonWeek','seasonWeekType','displayWeek','stageIndex','weekIndex'].map(key=>[key,numeric(season[key])])),
      sourceSeasonIdPresent:Boolean(hub?.sourceSeasonId??season.sourceSeasonId??hub?.seasonIndex??season.seasonIndex),
      availableWeeks:Array.isArray(hub?.availableWeekInfoList)?hub.availableWeekInfoList.slice(0,40).map(item=>({stageIndex:numeric(item?.stageIndex),weekIndex:numeric(item?.weekIndex)})):[]};
    throw error;
  }
}

function datasetKind(item) {
  if (item.kind === 'schedule') return 'schedules';
  if (item.kind === 'statistics') return item.args.category === 'team' ? 'teamstats' : item.args.category;
  if (item.kind === 'free-agents') return 'freeagents';
  return item.kind;
}

function isAuthenticationFailure(error) {
  return error?.status === 401 || ['EA_RECONNECT_REQUIRED', 'EA_MADDEN_SESSION_REJECTED', 'EA_NOT_CONFIGURED', 'EA_INVALID_REQUEST'].includes(error?.code);
}

/** One bounded collection checkpoint. State is private and must be encrypted by the caller. */
export async function runEaCollectionStep({ db, bucket, league, connection, job, client, token, state = {}, capture = adapter }) {
  assertScope(league, connection, job, state);
  if (state.done) return { state, done: true, result: state.result, step: 'Collection complete', progress: 100 };
  const externalLeagueId = Number(connection.external_league_id);
  const platform = connection.platform;
  const common = { db, bucket, leagueId: league.id, collectionId: job.id, platform, externalLeagueId: connection.external_league_id };

  if (!state.initialized) {
    const session = await client.login(token, platform);
    const rawHub = await client.hub(token, session, platform, externalLeagueId);
    const hub = checkedHub(capture, rawHub);
    const planned = capture.eaCapturePlan(rawHub, { mode: job.mode, includeRosters: true });
    const rosterRequests = planned.filter(item => item.kind === 'roster');
    const validRosters = rosterRequests.length === 32 && new Set(rosterRequests.map(item => String(item.args.teamId))).size === 32;
    const expectedRequests = validRosters ? planned : planned.filter(item => item.kind !== 'roster');
    if (expectedRequests.length < 3 || expectedRequests.length > MAX_REQUESTS || expectedRequests[0].kind !== 'hub') {
      throw collectionError('EA_COLLECTION_PLAN_INVALID', 'EA returned a collection plan that cannot be processed safely.');
    }
    const manifest = await capture.beginEaCapture({ ...common, league, actorId: job.actor_id, hub: rawHub, mode: job.mode, connectionId: connection.id });
    await capture.storeEaCapture({ ...common, sessionId: manifest.sessionId, kind: 'hub', args: {}, payload: rawHub, hub: rawHub });
    const { raw: _raw, ...retainedHub } = hub;
    state = {
      initialized: true, version: 1, collectionId: job.id, connectionId: connection.id,
      externalLeagueId: String(connection.external_league_id), platform, mode: job.mode,
      sessionId: manifest.sessionId, session, hub: retainedHub, expectedRequests, cursor: 1,
      warnings: job.mode !== 'yearly' && !validRosters ? [{ code: 'EA_ROSTER_INDEX_INCOMPLETE', dataset: 'roster', message: 'EA did not identify all 32 team rosters. Existing rosters will be retained where available.' }] : []
    };
    return checkpoint(state);
  }

  if (!Array.isArray(state.expectedRequests) || state.expectedRequests.length > MAX_REQUESTS
    || !Number.isInteger(state.cursor) || state.cursor < 1 || state.cursor > state.expectedRequests.length || !state.sessionId) {
    throw collectionError('EA_COLLECTION_CHECKPOINT_INVALID', 'The saved EA collection checkpoint is invalid. Start a fresh sync.');
  }
  // A refreshed access token invalidates the stored session; the caller clears it.
  if (!state.session) {
    state.session = await client.login(token, platform);
    return checkpoint(state);
  }
  const item = state.expectedRequests[state.cursor];
  if (item) {
    let payload;
    try {
      payload = await client.dataset(token, state.session, platform, externalLeagueId, datasetKind(item), item.args);
    } catch (error) {
      if (!['roster', 'free-agents'].includes(item.kind) || isAuthenticationFailure(error) || !(error instanceof EaClientError)) throw error;
      // Retain unavailability explicitly. The adapter excludes an incomplete roster domain.
      payload = { success: false, error: { code: error.code }, message: 'EA did not provide this dataset.' };
      const warning = { code: error.code, dataset: item.kind, teamId: item.args.teamId || null, message: 'EA did not provide this dataset. Existing information will be retained where available.' };
      state.warnings = [...(state.warnings || []).filter(existing => existing.dataset !== warning.dataset || existing.teamId !== warning.teamId), warning];
    }
    await capture.storeEaCapture({ ...common, sessionId: state.sessionId, kind: item.kind, args: item.args, payload });
    state.cursor += 1;
    return checkpoint(state);
  }

  const rawHub = await client.hub(token, state.session, platform, externalLeagueId);
  const finalHub = checkedHub(capture, rawHub);
  if (comparableHub(finalHub) !== comparableHub(state.hub)) {
    throw collectionError('EA_ADVANCED_DURING_COLLECTION', 'The Madden league advanced during collection. Start a fresh sync to collect one consistent week.');
  }
  const result = await capture.finalizeEaCapture({ ...common, sessionId: state.sessionId, mode: job.mode, actorId: job.actor_id, expectedRequests: state.expectedRequests, publishReady: job.mode !== 'preview' });
  const previewVerified = job.mode === 'preview' && result.readiness?.ready === true;
  const readyToImport = job.mode === 'weekly' && result.readiness?.ready === true && result.readyPointerChanged === true;
  const complete = result.readiness?.ready === true;
  const message = result.message || (previewVerified ? 'Private preview verified. EA Direct is ready to collect league updates.'
    : readyToImport ? 'EA data is ready. Select Import Latest Export to publish the update.'
      : job.mode === 'yearly' && complete ? 'The yearly schedule is available. The current league week has not changed.'
        : 'Collection finished, but the data is not ready to import. Review the missing or unavailable datasets.');
  state.result = { ...result, previewVerified, readyToImport, message,
    coverage: { currentPeriod: result.currentPeriod || state.hub.currentPeriod, collectedDatasets: result.retainedCaptureCount || state.expectedRequests.length,
      acceptedDatasets: result.acceptedCaptureCount ?? null, rosterComplete: Boolean(result.rosterComplete),
      freeAgentStatus: result.readiness?.freeAgentStatus || 'unknown', yearlySchedule: result.yearlyScheduleCoverage || null },
    datasetWarnings: state.warnings || [] };
  state.done = true;
  return { state, done: true, result: state.result, step: 'Collection complete', progress: 100 };
}
