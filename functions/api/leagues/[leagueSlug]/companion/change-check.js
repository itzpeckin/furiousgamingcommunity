import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.5.1a';

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.',release:RELEASE},400);

  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth.response;

  const db=database(context.env);
  const league=await resolveLeague(context.env,slug);
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.',release:RELEASE},404);

  const latest=await db.prepare(`SELECT discovery_session_id session_id,MAX(received_at) received_at
    FROM companion_route_captures
    WHERE league_id=? AND discovery_session_id IS NOT NULL AND discovery_session_id<>''
    GROUP BY discovery_session_id
    ORDER BY MAX(received_at) DESC LIMIT 1`).bind(league.id).first();

  if(!latest?.session_id)return json({ok:true,release:RELEASE,unchanged:false,reason:'no-capture-session'},200);

  const result=await db.prepare(`
    WITH latest_routes AS (
      SELECT route_path,payload_hash,received_at,
             ROW_NUMBER() OVER (PARTITION BY route_path ORDER BY received_at DESC) rn
      FROM companion_route_captures
      WHERE league_id=? AND discovery_session_id=?
    )
    SELECT lr.route_path,lr.payload_hash current_hash,
      (SELECT p.payload_hash
       FROM companion_route_captures p
       WHERE p.league_id=? AND p.route_path=lr.route_path
         AND COALESCE(p.discovery_session_id,'')<>?
         AND p.received_at<lr.received_at
       ORDER BY p.received_at DESC LIMIT 1) previous_hash
    FROM latest_routes lr
    WHERE lr.rn=1
  `).bind(league.id,latest.session_id,league.id,latest.session_id).all();

  const rows=result.results||[];
  let changed=0,unchanged=0,newRoutes=0;
  const changedRoutes=[];
  for(const row of rows){
    if(!row.previous_hash){newRoutes++;changed++;changedRoutes.push(row.route_path);continue}
    if(String(row.current_hash||'')===String(row.previous_hash||''))unchanged++;
    else{changed++;changedRoutes.push(row.route_path)}
  }

  const active=await db.prepare(`SELECT s.id,s.season_year,s.week_index,s.activated_at
    FROM league_active_snapshots a JOIN league_snapshots s ON s.id=a.snapshot_id
    WHERE a.league_id=? LIMIT 1`).bind(league.id).first();

  return json({
    ok:true,
    release:RELEASE,
    latestSessionId:String(latest.session_id),
    latestReceivedAt:latest.received_at,
    routeCount:rows.length,
    changedRouteCount:changed,
    unchangedRouteCount:unchanged,
    newRouteCount:newRoutes,
    changedRoutes:changedRoutes.slice(0,25),
    unchanged:Boolean(rows.length&&changed===0),
    activeSnapshot:active?{id:active.id,seasonYear:active.season_year,weekIndex:active.week_index,activatedAt:active.activated_at}:null
  });
}
