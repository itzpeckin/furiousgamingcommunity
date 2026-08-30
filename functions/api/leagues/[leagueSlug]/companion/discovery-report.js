import {
  json,
  database,
  normalizeLeagueSlug,
  validLeagueSlug,
  resolveLeague
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
import {
  generateMaddenDiscoveryReport,
  latestMaddenDiscoveryReport,
  publicMaddenDiscoveryReport
} from '../../../../_lib/madden-discovery-report.js';

const RELEASE = '7.3.4.2';

async function state(context) {
  const slug = normalizeLeagueSlug(context);
  if (!validLeagueSlug(slug)) return { response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400) };
  const authorization = await requireCommissioner(context);
  if (!authorization.authorized) return { response:authorization.response };
  const db = database(context.env);
  const league = db ? await resolveLeague(context.env,slug) : null;
  if (!db || !league || authorization.session.membership?.leagueId !== league.id) {
    return { response:json({ok:false,error:'Not found.'},404) };
  }
  if (!context.env.COMPANION_EXPORTS?.get) {
    return { response:json({ok:false,error:'Companion capture storage is unavailable.',release:RELEASE},503) };
  }
  return { db,league,slug,authorization };
}

async function sessionFor(db, leagueId, requestedSessionId) {
  if (requestedSessionId) return db.prepare(`SELECT * FROM madden_discovery_sessions
    WHERE league_id=? AND id=? LIMIT 1`).bind(leagueId,requestedSessionId).first();
  return db.prepare(`SELECT * FROM madden_discovery_sessions
    WHERE league_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`).bind(leagueId).first();
}

export async function onRequestGet(context) {
  const current = await state(context);
  if (current.response) return current.response;
  const report = await latestMaddenDiscoveryReport(current.db,current.league.id);
  return json({
    ok:true,
    release:RELEASE,
    reportAvailable:Boolean(report),
    report:publicMaddenDiscoveryReport(report),
    rawPayloadReturned:false,
    activationPerformed:false
  });
}

export async function onRequestPost(context) {
  const current = await state(context);
  if (current.response) return current.response;
  let body = {};
  try { body=await context.request.json(); } catch {}
  const session = await sessionFor(current.db,current.league.id,String(body.sessionId || '').trim());
  if (!session) return json({ok:false,error:'No Madden 27 discovery session is available.',release:RELEASE},404);
  try {
    const result = await generateMaddenDiscoveryReport({
      db:current.db,
      env:context.env,
      leagueId:current.league.id,
      sessionId:session.id,
      generatedByUserId:current.authorization.session.user.id,
      reuseExisting:body.reuseExisting === true
    });
    return json({
      ok:true,
      release:RELEASE,
      ...result,
      rawPayloadReturned:false,
      activationPerformed:false,
      activeSnapshotChanged:false
    });
  } catch (error) {
    return json({ok:false,error:error?.message || 'The export could not be analyzed.',release:RELEASE},error?.status || 500);
  }
}
