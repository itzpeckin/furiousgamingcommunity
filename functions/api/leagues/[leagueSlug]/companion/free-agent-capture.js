import { json, database, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';

const RELEASE='5.9.10.6.2e';
const FREE_AGENT_ROUTE=/\/free[-_]?agents?\/(?:roster|players)\/?$/i;
const TEAM_ROSTER_ROUTE=/\/team\/[^/]+\/roster\/?$/i;

async function routeRows(db,leagueId){
  const result=await db.prepare(`SELECT id,discovery_session_id,route_path,byte_length,r2_object_key,received_at
    FROM companion_route_captures
    WHERE league_id=?
    ORDER BY received_at DESC LIMIT 300`).bind(leagueId).all();
  return result.results||[];
}

async function payload(env,row){
  if(!row?.r2_object_key||!env.COMPANION_EXPORTS?.get)return null;
  const object=await env.COMPANION_EXPORTS.get(row.r2_object_key);
  if(!object)return null;
  try{return JSON.parse(await object.text())}catch{return null}
}

export async function onRequestGet(context){
  const slug=String(context.params?.leagueSlug||'').trim().toLowerCase();
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.',release:RELEASE},400);
  const db=database(context.env);
  if(!db)return json({ok:false,error:'D1 is not configured.',release:RELEASE},503);
  const league=await resolveLeague(context.env,slug);
  if(!league)return json({ok:false,error:'League not found.',release:RELEASE},404);

  const rows=await routeRows(db,league.id);
  const teamRows=rows.filter(row=>TEAM_ROSTER_ROUTE.test(String(row.route_path||'')));
  const latestTeam=teamRows[0]||null;
  const latestTeamSession=latestTeam?.discovery_session_id||null;
  const latestTeamAt=latestTeam?.received_at||null;

  const freeRows=rows.filter(row=>FREE_AGENT_ROUTE.test(String(row.route_path||''))||/free.?agent/i.test(String(row.route_path||'')));
  const attempts=[];
  let usable=null;

  for(const row of freeRows){
    const body=await payload(context.env,row);
    const list=Array.isArray(body?.rosterInfoList)?body.rosterInfoList:
      Array.isArray(body?.players)?body.players:[];
    const ok=body?.success!==false&&list.length>0;
    const freshForLatestSession=Boolean(latestTeamSession&&row.discovery_session_id===latestTeamSession);
    const freshAfterLatestRosterStart=Boolean(latestTeamAt&&new Date(row.received_at).getTime()>=new Date(latestTeamAt).getTime()-120000);
    const item={
      captureId:row.id,
      discoverySessionId:row.discovery_session_id,
      routePath:row.route_path,
      receivedAt:row.received_at,
      recordCount:list.length,
      payloadSuccess:body?.success??null,
      message:body?.message||null,
      usable:ok,
      sameSessionAsLatestRosters:freshForLatestSession,
      freshRelativeToLatestRosters:freshAfterLatestRosterStart
    };
    attempts.push(item);
    if(!usable&&ok&&(freshForLatestSession||freshAfterLatestRosterStart))usable=item;
  }

  const freshAttempt=attempts.find(item=>item.sameSessionAsLatestRosters||item.freshRelativeToLatestRosters)||null;
  const staleOnly=Boolean(attempts.length&&!freshAttempt);

  return json({
    ok:true,
    release:RELEASE,
    latestRosterExport:{
      discoverySessionId:latestTeamSession,
      receivedAt:latestTeamAt,
      capturedTeamRosterRoutes:new Set(teamRows.filter(row=>row.discovery_session_id===latestTeamSession).map(row=>row.route_path)).size
    },
    freeAgentRoute:'xbsx/{franchiseId}/freeagents/roster',
    freeAgentCapture:{
      anyCaptureAvailable:Boolean(attempts.length),
      freshCaptureAvailable:Boolean(freshAttempt),
      freshUsableCaptureAvailable:Boolean(usable),
      staleCaptureOnly:staleOnly,
      usableCapture:usable,
      newestAttempt:attempts[0]||null,
      attempts:attempts.slice(0,20)
    },
    diagnosis:usable
      ?'READY: A fresh, non-empty Free Agent roster was received with the current Rosters export.'
      : freshAttempt
        ?'FRESH-FAILED: The current Rosters export attempted a Free Agent route, but Madden/Companion returned an unusable payload.'
        : attempts.length
          ?'STALE-ONLY: Franchise HQ has an older Free Agent attempt, but the latest Rosters export did not send a fresh Free Agent route.'
          :'NOT-CAPTURED: No Free Agent route has ever been received for this league.'
  });
}
