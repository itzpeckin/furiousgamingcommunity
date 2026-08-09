import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';
const RELEASE='5.9.3.6',DEFAULT_OWNER_ACCOUNT_ID='owner-tb';
const ownerAccountId=env=>String(env.PLATFORM_OWNER_ACCOUNT_ID||DEFAULT_OWNER_ACCOUNT_ID).trim();
async function requirePlatformOwner(context){const auth=await requireCommissioner(context);if(!auth.authorized)return auth;const presented=String(context.request.headers.get('x-franchisehq-platform-owner-account-id')||'').trim();if(!presented||presented!==ownerAccountId(context.env))return{authorized:false,response:json({ok:false,error:'Not found.'},404)};return auth;}
const parse=v=>{try{return JSON.parse(v||'null')}catch{return null}};
async function latest(db,table,leagueId,status=true){const where=status?" AND status='pending-preview'":'';return db.prepare(`SELECT * FROM ${table} WHERE league_id=?${where} ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();}
async function rows(db,sql,...args){const r=await db.prepare(sql).bind(...args).all();return r.results||[];}
async function standings(context,leagueId){const c=await database(context.env).prepare(`SELECT id,route_path,r2_object_key,received_at FROM companion_route_captures WHERE league_id=? AND route_path LIKE '%/standings' ORDER BY received_at DESC LIMIT 1`).bind(leagueId).first();if(!c)return{capture:null,records:[]};const obj=await context.env.COMPANION_EXPORTS.get(c.r2_object_key);if(!obj)return{capture:c,records:[]};const data=JSON.parse(new TextDecoder().decode(await obj.arrayBuffer()));const arrays=[];const walk=(v,p='$',d=0)=>{if(d>6||v==null)return;if(Array.isArray(v)){arrays.push({path:p,values:v});return}if(typeof v==='object')for(const[k,x]of Object.entries(v))walk(x,`${p}.${k}`,d+1)};walk(data);arrays.sort((a,b)=>b.values.length-a.values.length);return{capture:c,records:(arrays[0]?.values||[]).filter(x=>x&&typeof x==='object')};}
function publicSnapshot(s){if(!s)return null;return{snapshotId:s.id,status:s.status,seasonYear:s.season_year,weekIndex:s.week_index,counts:{teams:s.team_count,players:s.player_count,games:s.game_count,statistics:s.statistic_count,standings:s.standing_count},warningCount:s.warning_count,warnings:parse(s.warnings_json)||[],manifest:parse(s.manifest_json)||{},createdAt:s.created_at,activatedAt:s.activated_at||null};}
async function getLatest(db,leagueId){return publicSnapshot(await db.prepare(`SELECT * FROM league_snapshots WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first());}
export async function onRequestGet(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);const auth=await requirePlatformOwner(context);if(!auth.authorized)return auth.response;const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);const snapshot=await getLatest(db,league.id);return json({ok:true,release:RELEASE,snapshotAvailable:Boolean(snapshot),snapshot,activeSnapshotChanged:false,activationPerformed:false});}
export async function onRequestPost(context){const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);const auth=await requirePlatformOwner(context);if(!auth.authorized)return auth.response;const db=database(context.env),league=await resolveLeague(context.env,slug);if(!db||!league||auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Not found.'},404);
try{
 const teamRun=await latest(db,'companion_team_mapping_runs',league.id),playerRun=await latest(db,'companion_player_mapping_runs',league.id),scheduleRun=await latest(db,'companion_schedule_mapping_runs',league.id),statisticsRun=await latest(db,'companion_statistics_mapping_runs',league.id);
 const missing=[];if(!teamRun)missing.push('teams');if(!playerRun)missing.push('players');if(!scheduleRun)missing.push('schedule');if(!statisticsRun)missing.push('statistics');if(missing.length)return json({ok:false,error:`Map required domains before building a snapshot: ${missing.join(', ')}.`},422);
 const teams=await rows(db,`SELECT * FROM companion_canonical_teams_preview WHERE league_id=? AND mapping_run_id=?`,league.id,teamRun.id);
 const players=await rows(db,`SELECT * FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=?`,league.id,playerRun.id);
 const games=await rows(db,`SELECT * FROM companion_canonical_games_preview WHERE league_id=? AND mapping_run_id=?`,league.id,scheduleRun.id);
 const statistics=await rows(db,`SELECT * FROM companion_canonical_statistics_preview WHERE league_id=? AND mapping_run_id=?`,league.id,statisticsRun.id);
 const standingSource=await standings(context,league.id),standingRows=standingSource.records;
 const warnings=[];
 if(teams.length!==32)warnings.push(`Expected 32 teams; found ${teams.length}.`);
 if(!players.length)warnings.push('No players were available.');
 if(!games.length)warnings.push('No games were available.');
 if(!statistics.length)warnings.push('No statistics were available.');
 if(!standingRows.length)warnings.push('No standings payload was available.');
 if(Number(playerRun.warning_count||0))warnings.push(`Player mapper reported ${playerRun.warning_count} warning(s).`);
 if(Number(scheduleRun.warning_count||0))warnings.push(`Schedule mapper reported ${scheduleRun.warning_count} warning(s).`);
 if(Number(statisticsRun.warning_count||0))warnings.push(`Statistics mapper reported ${statisticsRun.warning_count} warning(s).`);
 const seasonCandidates=[...games.map(x=>x.season_year),...statistics.map(x=>x.season_year),...standingRows.map(x=>x.calendarYear)].map(Number).filter(Number.isFinite);
 const weekCandidates=[...games.map(x=>x.week_index),...statistics.map(x=>x.week_index),...standingRows.map(x=>x.weekIndex)].map(Number).filter(Number.isFinite);
 const manifest={release:RELEASE,leagueId:league.id,sources:{teamMappingRunId:teamRun.id,playerMappingRunId:playerRun.id,scheduleMappingRunId:scheduleRun.id,statisticsMappingRunId:statisticsRun.id,standingsCaptureId:standingSource.capture?.id||null,standingsRoute:standingSource.capture?.route_path||null},builtAt:new Date().toISOString(),immutable:true,activationPerformed:false};
 const snapshotId=crypto.randomUUID();
 await db.prepare(`INSERT INTO league_snapshots (id,league_id,status,season_year,week_index,team_count,player_count,game_count,statistic_count,standing_count,warning_count,warnings_json,manifest_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(snapshotId,league.id,'pending-validation',seasonCandidates.length?Math.max(...seasonCandidates):null,weekCandidates.length?Math.max(...weekCandidates):null,teams.length,players.length,games.length,statistics.length,standingRows.length,warnings.length,JSON.stringify(warnings),JSON.stringify(manifest)).run();
 const inserts=[];const add=(domain,items,idFn)=>items.forEach((item,i)=>inserts.push(db.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`).bind(snapshotId,league.id,domain,String(idFn(item,i)),JSON.stringify(item))));
 add('teams',teams,(x,i)=>x.external_id||i);add('players',players,(x,i)=>x.external_id||i);add('games',games,(x,i)=>x.external_id||i);add('statistics',statistics,(x,i)=>x.external_key||i);add('standings',standingRows,(x,i)=>x.teamId||x.teamName||i);
 for(let i=0;i<inserts.length;i+=75)await db.batch(inserts.slice(i,i+75));
 const snapshot=await getLatest(db,league.id);return json({ok:true,release:RELEASE,snapshotAvailable:true,snapshot,activeSnapshotChanged:false,activationPerformed:false});
}catch(error){return json({ok:false,error:'Pending snapshot build failed.',detail:error?.message||String(error),release:RELEASE},500)}}
