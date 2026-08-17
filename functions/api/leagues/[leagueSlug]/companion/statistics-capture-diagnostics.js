import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.3P.5e';
const DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
const parse=(value,fallback=null)=>{try{return JSON.parse(value||'')}catch{return fallback}};

async function state(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.',release:RELEASE},400)};
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return{response:auth.response};
  const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();
  if(!presented||presented!==ownerAccountId(context.env))return{response:json({ok:false,error:'Not found.'},404)};
  const db=database(context.env);
  const league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league||auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};
  return{db,league};
}

export async function onRequestGet(context){
  const s=await state(context);if(s.response)return s.response;

  const run=await s.db.prepare(`SELECT * FROM companion_statistics_mapping_runs
    WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(s.league.id).first();
  if(!run)return json({ok:true,release:RELEASE,run:null,failedRoutes:[]});

  const rows=(await s.db.prepare(`SELECT route_path,capture_id,error_json,warnings_json,record_count,record_total,status
    FROM companion_statistics_mapping_batches
    WHERE league_id=? AND mapping_run_id=? AND status='failed'
    ORDER BY route_path`).bind(s.league.id,run.id).all()).results||[];

  const failedRoutes=rows.map(row=>{
    const error=parse(row.error_json,{})||{};
    return{
      routePath:row.route_path,
      captureId:row.capture_id,
      status:row.status,
      recordCount:Number(row.record_count||0),
      recordTotal:row.record_total==null?null:Number(row.record_total),
      error:error.error||null,
      candidates:Array.isArray(error.candidates)?error.candidates:[],
      warnings:parse(row.warnings_json,[])||[]
    };
  });

  const reasons={};
  for(const route of failedRoutes){
    for(const candidate of route.candidates||[]){
      const reason=String(candidate.reason||'unknown');
      reasons[reason]=(reasons[reason]||0)+1;
    }
  }

  return json({
    ok:true,
    release:RELEASE,
    run:{
      id:run.id,
      status:run.status,
      routeCount:Number(run.route_count||0),
      recordCount:Number(run.record_count||0),
      warningCount:Number(run.warning_count||0),
      createdAt:run.created_at
    },
    reasonSummary:reasons,
    failedRouteCount:failedRoutes.length,
    failedRoutes
  });
}
