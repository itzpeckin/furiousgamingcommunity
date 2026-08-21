import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.5.3a';

async function tableExists(db,name){
  return Boolean(await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).bind(name).first());
}

function routeClass(route=''){
  const value=String(route||'').toLowerCase();
  if(/\/team\/[^/]+\/roster\/?$/.test(value)||/roster/.test(value))return'roster';
  if(/\/week\/(?:pre|reg|post|playoffs?)\/\d+\/(?:defense|kicking|passing|punting|receiving|rushing|team)\/?$/.test(value))return'statistics';
  if(/schedule|game/.test(value))return'schedule';
  if(/standing/.test(value))return'standings';
  if(/team/.test(value))return'teams';
  return'other';
}

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

  const active=await db.prepare(`SELECT s.id,s.season_year,s.week_index,s.activated_at
    FROM league_active_snapshots a JOIN league_snapshots s ON s.id=a.snapshot_id
    WHERE a.league_id=? LIMIT 1`).bind(league.id).first();

  const latestCaptureMs=Date.parse(String(latest.received_at||''));
  const activeMs=Date.parse(String(active?.activated_at||''));
  const noNewCaptureSinceActive=Boolean(
    active?.id &&
    Number.isFinite(latestCaptureMs) &&
    Number.isFinite(activeMs) &&
    latestCaptureMs <= activeMs
  );

  if(noNewCaptureSinceActive){
    return json({
      ok:true,
      release:RELEASE,
      latestSessionId:String(latest.session_id),
      latestReceivedAt:latest.received_at,
      unchanged:true,
      noNewExport:true,
      reason:'latest-companion-capture-already-consumed',
      routeCount:0,
      changedRouteCount:0,
      unchangedRouteCount:0,
      newRouteCount:0,
      changedRoutes:[],
      changedByClass:{roster:0,statistics:0,schedule:0,standings:0,teams:0,other:0},
      rosterChanged:false,
      canReusePlayers:true,
      activeSnapshot:{
        id:active.id,
        seasonYear:active.season_year,
        weekIndex:active.week_index,
        activatedAt:active.activated_at
      }
    });
  }

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
  const changedByClass={roster:0,statistics:0,schedule:0,standings:0,teams:0,other:0};
  for(const row of rows){
    const isNew=!row.previous_hash;
    const isChanged=isNew||String(row.current_hash||'')!==String(row.previous_hash||'');
    if(isNew)newRoutes++;
    if(isChanged){
      changed++;
      changedRoutes.push(row.route_path);
      changedByClass[routeClass(row.route_path)]++;
    }else unchanged++;
  }

  let latestPlayerMappingRunId=null;
  let reusablePlayerPreviewCount=0;
  if(active&&await tableExists(db,'companion_player_mapping_runs')&&await tableExists(db,'companion_canonical_players_preview')){
    const playerRun=await db.prepare(`SELECT id FROM companion_player_mapping_runs
      WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(league.id).first();
    latestPlayerMappingRunId=playerRun?.id?String(playerRun.id):null;
    if(latestPlayerMappingRunId){
      reusablePlayerPreviewCount=Number((await db.prepare(`SELECT COUNT(*) c FROM companion_canonical_players_preview
        WHERE league_id=? AND mapping_run_id=?`).bind(league.id,latestPlayerMappingRunId).first())?.c||0);
    }
  }

  const rosterChanged=Number(changedByClass.roster||0)>0;
  const canReusePlayers=Boolean(active&&!rosterChanged&&latestPlayerMappingRunId&&reusablePlayerPreviewCount>0);

  return json({
    ok:true,
    release:RELEASE,
    latestSessionId:String(latest.session_id),
    latestReceivedAt:latest.received_at,
    routeCount:rows.length,
    changedRouteCount:changed,
    unchangedRouteCount:unchanged,
    newRouteCount:newRoutes,
    changedRoutes,
    changedByClass,
    rosterChanged,
    canReusePlayers,
    reusablePlayerPreviewCount,
    latestPlayerMappingRunId,
    unchanged:Boolean(rows.length&&changed===0),
    activeSnapshot:active?{id:active.id,seasonYear:active.season_year,weekIndex:active.week_index,activatedAt:active.activated_at}:null
  });
}
