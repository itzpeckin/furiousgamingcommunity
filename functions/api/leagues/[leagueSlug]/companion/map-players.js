import {
  json,
  database,
  normalizeLeagueSlug,
  validLeagueSlug,
  resolveLeague
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE = '5.9.3.3a';

const A = Object.freeze({
  id: ['playerId','playerID','id','player_id','rosterId','assetId'],
  teamId: ['teamId','teamID','team_id','clubId','franchiseId'],
  firstName: ['firstName','first_name','fname','givenName'],
  lastName: ['lastName','last_name','lname','surname'],
  displayName: ['displayName','fullName','playerName','name'],
  position: ['position','positionName','pos','positionAbbr'],
  archetype: ['archetype','playerArchetype','archetypeName'],
  overall: ['overall','overallRating','ovr','playerOverall'],
  dev: ['developmentTrait','devTrait','development','devTraitName'],
  age: ['age','playerAge'], yearsPro: ['yearsPro','experience','exp','yearsExperience'],
  jersey: ['jerseyNumber','jersey','number'], height: ['height','heightInches','height_inches'],
  weight: ['weight','weightLbs','weight_lbs'], college: ['college','collegeName','school'],
  injury: ['injuryStatus','injury','status'], injured: ['isInjured','injured'],
  contractYears: ['contractYearsRemaining','yearsRemaining','contractLength','contractYears'],
  salary: ['salary','totalSalary','contractSalary'], capHit: ['capHit','salaryCapHit','cap'],
  portrait: ['portraitId','portraitID','headshotId','assetId']
});

function own(o,k){return o&&Object.prototype.hasOwnProperty.call(o,k);}
function first(record, aliases){
  for(const key of aliases) if(own(record,key)&&record[key]!==null&&record[key]!=='') return record[key];
  const lower=new Map(Object.keys(record||{}).map(k=>[k.toLowerCase(),k]));
  for(const key of aliases){const actual=lower.get(String(key).toLowerCase());if(actual&&record[actual]!==null&&record[actual]!=='')return record[actual];}
  return null;
}
function text(v){if(v===null||v===undefined)return null;const s=String(v).trim();return s||null;}
function int(v){const n=Number.parseInt(v,10);return Number.isFinite(n)?n:null;}
function money(v){const n=Number(v);return Number.isFinite(n)?Math.round(n):null;}
function bool(v){return v===true||v===1||v==='1'||['true','yes','injured'].includes(String(v??'').toLowerCase());}
function collectArrays(value,path='$',depth=0,out=[]){
  if(depth>7||value==null)return out;
  if(Array.isArray(value)){out.push({path,records:value});for(let i=0;i<Math.min(value.length,2);i++)collectArrays(value[i],`${path}[${i}]`,depth+1,out);return out;}
  if(typeof value==='object')for(const [k,v] of Object.entries(value))collectArrays(v,`${path}.${k}`,depth+1,out);
  return out;
}
function playerShape(record){
  if(!record||typeof record!=='object'||Array.isArray(record))return {score:-99};
  let score=0;
  if(first(record,A.id)!=null)score+=5;
  if(first(record,A.firstName)!=null||first(record,A.displayName)!=null)score+=3;
  if(first(record,A.lastName)!=null)score+=2;
  if(first(record,A.position)!=null)score+=4;
  if(first(record,A.overall)!=null)score+=3;
  if(first(record,A.teamId)!=null)score+=2;
  const keys=new Set(Object.keys(record).map(k=>k.toLowerCase()));
  if(keys.has('passyards')||keys.has('passingyards')||keys.has('rushyards')||keys.has('receivingyards')||keys.has('tackles'))score-=8;
  if(keys.has('teamname')&&!keys.has('playerid')&&!keys.has('firstname'))score-=8;
  return {score};
}
function chooseCollection(payload){
  const candidates=collectArrays(payload).map(c=>{
    const objects=c.records.filter(v=>v&&typeof v==='object'&&!Array.isArray(v));
    const sample=objects.slice(0,20);
    const scores=sample.map(v=>playerShape(v).score);
    const good=scores.filter(v=>v>=9).length;
    const avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:-99;
    const pathBonus=/(?:players?|rosters?|freeagents?)/i.test(c.path)?10:0;
    return {...c,objects,good,score:avg+pathBonus};
  }).filter(c=>c.objects.length&&c.good>=Math.min(3,c.objects.length));
  candidates.sort((a,b)=>b.score-a.score||b.objects.length-a.objects.length);
  return candidates[0]||null;
}
function routeRank(path){
  const p=String(path||'').toLowerCase().replace(/\/+$/,'');
  if(p.endsWith('/leagueplayers'))return 0;
  if(p.endsWith('/players'))return 1;
  if(p.endsWith('/rosters')||p.endsWith('/roster'))return 2;
  if(p.endsWith('/freeagents'))return 3;
  if(p.endsWith('/leagueteams'))return 10;
  if(p.endsWith('/standings'))return 20;
  if(p.endsWith('/team'))return 30;
  return 40;
}
function weeklyStatRoute(path){return /\/week\/(?:pre|reg|post)\/\d+\/(passing|rushing|receiving|kicking|punting|defense|schedules|team)$/.test(String(path||'').toLowerCase().replace(/\/+$/,''));}
async function sourceCaptures(db,leagueId){
  const result=await db.prepare(`SELECT c.id capture_id,c.discovery_session_id,c.route_path,c.r2_object_key,c.received_at,
      COALESCE(i.dataset_type,'unknown') dataset_type,COALESCE(i.confidence_score,0) confidence_score
    FROM companion_route_captures c
    LEFT JOIN companion_dataset_inspections i ON i.capture_id=c.id
    WHERE c.league_id=? ORDER BY c.received_at DESC`).bind(leagueId).all();
  const all=result.results||[];
  const rows=all.filter(r=>!weeklyStatRoute(r.route_path))
    .sort((a,b)=>routeRank(a.route_path)-routeRank(b.route_path)||Number(b.confidence_score)-Number(a.confidence_score)||String(b.received_at).localeCompare(String(a.received_at)));
  return {captures:rows,candidates:all.map(r=>r.route_path)};
}
async function discoverNestedPlayerCollection(env,captures){
  const diagnostics=[];
  let best=null;
  for(const capture of captures){
    try{
      const payload=await parsePayload(env,capture);
      const collection=chooseCollection(payload);
      if(!collection){diagnostics.push({routePath:capture.route_path,accepted:false,reason:'No player-shaped nested array found.'});continue;}
      const routeBonus=Math.max(0,12-routeRank(capture.route_path));
      const totalScore=collection.score+routeBonus+Math.min(8,Math.log10(Math.max(10,collection.objects.length))*2);
      const candidate={capture,collection,totalScore};
      diagnostics.push({routePath:capture.route_path,collectionPath:collection.path,recordCount:collection.objects.length,shapeScore:Number(collection.score.toFixed(2)),totalScore:Number(totalScore.toFixed(2)),accepted:true});
      if(!best||candidate.totalScore>best.totalScore||(candidate.totalScore===best.totalScore&&candidate.collection.objects.length>best.collection.objects.length))best=candidate;
    }catch(error){diagnostics.push({routePath:capture.route_path,accepted:false,reason:error?.message||String(error)});}
  }
  return {best,diagnostics};
}
async function parsePayload(env,capture){
  if(!capture?.r2_object_key)throw new Error('The player capture has no R2 object key.');
  const obj=await env.COMPANION_EXPORTS.get(capture.r2_object_key);if(!obj)throw new Error('The private player payload could not be found in R2.');
  const raw=new TextDecoder('utf-8',{fatal:false}).decode(await obj.arrayBuffer()).trim();
  if(!raw)throw new Error('The captured player payload is empty.');
  try{return JSON.parse(raw);}catch{throw new Error('The captured player payload is not valid JSON.');}
}
function normalizePosition(v){const p=text(v)?.toUpperCase();const map={HB:'RB',FS:'FS',SS:'SS',LE:'LE',RE:'RE',MLB:'MLB',LOLB:'LOLB',ROLB:'ROLB'};return p?map[p]||p:null;}
function normalizeDev(v){const s=text(v);if(!s)return null;const n=Number(s);if(Number.isFinite(n)){return ({0:'Normal',1:'Star',2:'Superstar',3:'X-Factor'})[n]||s;}const l=s.toLowerCase().replace(/[_-]/g,' ');if(l.includes('x')&&l.includes('factor'))return 'X-Factor';if(l.includes('superstar'))return 'Superstar';if(l.includes('star'))return 'Star';if(l.includes('normal'))return 'Normal';return s;}
function heightInches(v){if(v==null)return null;if(Number.isFinite(Number(v)))return int(v);const m=String(v).match(/(\d+)\D+(\d+)/);return m?Number(m[1])*12+Number(m[2]):null;}
function canonical(record,index){
  const firstName=text(first(record,A.firstName)),lastName=text(first(record,A.lastName));
  const displayName=text(first(record,A.displayName))||[firstName,lastName].filter(Boolean).join(' ')||`Player ${index+1}`;
  const externalId=text(first(record,A.id))||`generated-player-${index+1}`;
  const injury=text(first(record,A.injury));
  const ratings={};for(const [k,v] of Object.entries(record||{})){if(typeof v==='number'&&/(speed|accel|agility|awareness|throw|catch|route|tackle|block|strength|power|accuracy|coverage|pursuit|playrec)/i.test(k))ratings[k]=v;}
  return {externalId,teamExternalId:text(first(record,A.teamId)),firstName,lastName,displayName,position:normalizePosition(first(record,A.position)),archetype:text(first(record,A.archetype)),overall:int(first(record,A.overall)),developmentTrait:normalizeDev(first(record,A.dev)),age:int(first(record,A.age)),yearsPro:int(first(record,A.yearsPro)),jerseyNumber:int(first(record,A.jersey)),heightInches:heightInches(first(record,A.height)),weightLbs:int(first(record,A.weight)),college:text(first(record,A.college)),injuryStatus:injury,isInjured:bool(first(record,A.injured))||Boolean(injury&&!/none|healthy/i.test(injury)),contractYearsRemaining:int(first(record,A.contractYears)),salary:money(first(record,A.salary)),capHit:money(first(record,A.capHit)),portraitId:text(first(record,A.portrait)),ratings,sourceRecord:record};
}
async function teamIds(db,leagueId){const run=await db.prepare(`SELECT id FROM companion_team_mapping_runs WHERE league_id=? AND status='pending-preview' ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();if(!run)return new Set();const r=await db.prepare(`SELECT external_id FROM companion_canonical_teams_preview WHERE league_id=? AND mapping_run_id=?`).bind(leagueId,run.id).all();return new Set((r.results||[]).map(x=>String(x.external_id)));}
async function latestRun(db,leagueId){return db.prepare(`SELECT * FROM companion_player_mapping_runs WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();}
async function preview(db,leagueId,runId){if(!runId)return[];const r=await db.prepare(`SELECT external_id,team_external_id,first_name,last_name,display_name,position,archetype,overall,development_trait,age,years_pro,jersey_number,height_inches,weight_lbs,college,injury_status,is_injured,contract_years_remaining,salary,cap_hit,portrait_id FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=? ORDER BY team_external_id,overall DESC,display_name`).bind(leagueId,runId).all();return (r.results||[]).map(x=>({externalId:x.external_id,teamExternalId:x.team_external_id,firstName:x.first_name,lastName:x.last_name,displayName:x.display_name,position:x.position,archetype:x.archetype,overall:x.overall,developmentTrait:x.development_trait,age:x.age,yearsPro:x.years_pro,jerseyNumber:x.jersey_number,heightInches:x.height_inches,weightLbs:x.weight_lbs,college:x.college,injuryStatus:x.injury_status,isInjured:Boolean(x.is_injured),contractYearsRemaining:x.contract_years_remaining,salary:x.salary,capHit:x.cap_hit,portraitId:x.portrait_id}));}
function runPayload(run){if(!run)return null;let warnings=[];try{warnings=JSON.parse(run.warnings_json||'[]')}catch{}return{id:run.id,discoverySessionId:run.discovery_session_id,sourceCaptureId:run.source_capture_id,sourceRoutePath:run.source_route_path,status:run.status,playerCount:run.player_count,rosteredCount:run.rostered_count,freeAgentCount:run.free_agent_count,warningCount:run.warning_count,warnings,createdAt:run.created_at,updatedAt:run.updated_at};}
function response(run,players,slug,leagueId,extra={}){return{ok:true,release:RELEASE,leagueId,leagueSlug:slug,previewAvailable:Boolean(run),mappingRun:runPayload(run),players,activeSnapshotChanged:false,activationPerformed:false,rawPayloadReturned:false,...extra};}

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const db=database(context.env);if(!db)return json({ok:false,error:'D1 is not configured.'},503);
  const league=await resolveLeague(context.env,slug);if(!league)return json({ok:false,error:'League not found.'},404);
  const run=await latestRun(db,league.id);return json(response(run,await preview(db,league.id,run?.id),slug,league.id));
}

export async function onRequestPost(context){
  const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const auth=await requireCommissioner(context);if(!auth.authorized)return auth.response;
  const db=database(context.env);if(!db||!context.env.COMPANION_EXPORTS?.get)return json({ok:false,error:'D1 and R2 must be configured.'},503);
  const league=await resolveLeague(context.env,slug);if(!league)return json({ok:false,error:'League not found.'},404);
  if(auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Commissioner membership does not match this league.'},403);
  try{
    const source=await sourceCaptures(db,league.id);
    if(!source.captures.length)return json({ok:false,error:'No eligible League Info payloads have been captured yet.',availableRoutes:source.candidates},404);
    const discovery=await discoverNestedPlayerCollection(context.env,source.captures);
    if(!discovery.best||discovery.best.collection.score<8)return json({ok:false,error:'No reliable nested player collection was found in the captured League Info payloads.',detail:'The hotfix inspected every non-weekly-stat capture and rejected collections that did not contain player identity fields.',availableRoutes:source.candidates,candidateDiagnostics:discovery.diagnostics},422);
    const sourceCapture=discovery.best.capture;
    const collection=discovery.best.collection;
    const validTeams=await teamIds(db,league.id);if(!validTeams.size)return json({ok:false,error:'Map the canonical Teams preview before mapping players.'},409);
    const warnings=[],players=[],seen=new Set();let rostered=0,freeAgents=0;
    for(let i=0;i<collection.objects.length;i++){
      const p=canonical(collection.objects[i],i);if(seen.has(p.externalId)){warnings.push(`Duplicate player ID skipped: ${p.externalId}`);continue;}seen.add(p.externalId);
      if(p.externalId.startsWith('generated-player-'))warnings.push(`Generated missing player ID for ${p.displayName}.`);
      if(!p.position)warnings.push(`Missing position for ${p.displayName}.`);
      if(p.teamExternalId&&validTeams.has(String(p.teamExternalId)))rostered++;else{freeAgents++;if(p.teamExternalId&&!['0','-1','null'].includes(String(p.teamExternalId)))warnings.push(`Unknown team ID ${p.teamExternalId} for ${p.displayName}; treated as unassigned.`);p.teamExternalId=null;}
      players.push(p);
    }
    if(!players.length)return json({ok:false,error:'No canonical players were produced.'},422);
    await db.prepare(`UPDATE companion_player_mapping_runs SET status='superseded',updated_at=? WHERE league_id=? AND status='pending-preview'`).bind(new Date().toISOString(),league.id).run();
    const runId=crypto.randomUUID(),now=new Date().toISOString();
    await db.prepare(`INSERT INTO companion_player_mapping_runs (id,league_id,discovery_session_id,source_capture_id,source_route_path,status,player_count,rostered_count,free_agent_count,warning_count,warnings_json,created_at,updated_at) VALUES (?,?,?,?,?,'pending-preview',?,?,?,?,?,?,?)`).bind(runId,league.id,sourceCapture.discovery_session_id,sourceCapture.capture_id,sourceCapture.route_path,players.length,rostered,freeAgents,warnings.length,JSON.stringify(warnings),now,now).run();
    const stmt=db.prepare(`INSERT INTO companion_canonical_players_preview (mapping_run_id,league_id,external_id,team_external_id,first_name,last_name,display_name,position,archetype,overall,development_trait,age,years_pro,jersey_number,height_inches,weight_lbs,college,injury_status,is_injured,contract_years_remaining,salary,cap_hit,portrait_id,ratings_json,source_record_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for(const p of players){await stmt.bind(runId,league.id,p.externalId,p.teamExternalId,p.firstName,p.lastName,p.displayName,p.position,p.archetype,p.overall,p.developmentTrait,p.age,p.yearsPro,p.jerseyNumber,p.heightInches,p.weightLbs,p.college,p.injuryStatus,p.isInjured?1:0,p.contractYearsRemaining,p.salary,p.capHit,p.portraitId,JSON.stringify(p.ratings),JSON.stringify(p.sourceRecord),now).run();}
    const run=await latestRun(db,league.id);return json(response(run,await preview(db,league.id,run.id),slug,league.id,{collectionPath:collection.path,candidateDiagnostics:discovery.diagnostics}));
  }catch(error){return json({ok:false,error:'Player mapping failed.',detail:error?.message||String(error),release:RELEASE},500);}
}
