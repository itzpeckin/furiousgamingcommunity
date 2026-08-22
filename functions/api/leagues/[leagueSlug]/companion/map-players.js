/* FHQ_BUILD: 5.9.10.6.5.4h-p5a */
import {
  json,
  database,
  normalizeLeagueSlug,
  validLeagueSlug,
  resolveLeague
} from '../../../../_lib/cloud-platform.js';
import { requireCommissioner } from '../../../../_lib/permissions.js';

const RELEASE='5.9.10.6.5.4h-p5a';
const ROSTER_ROUTE = /\/team\/([^/]+)\/roster\/?$/i;
const FREE_AGENT_ROUTE = /\/freeagents\/roster\/?$/i;

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
  injury: ['injuryStatus','injury'], injured: ['isInjured','injured'],
  rosterStatus: ['rosterStatus','roster_status','playerStatus','player_status','status','transactionStatus'],
  retired: ['isRetired','retired','hasRetired'],
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
    const sample=objects.slice(0,24);
    const scores=sample.map(v=>playerShape(v).score);
    const good=scores.filter(v=>v>=9).length;
    const avg=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:-99;
    const pathBonus=/(?:players?|rosters?|rosterinfo)/i.test(c.path)?10:0;
    return {...c,objects,good,score:avg+pathBonus};
  }).filter(c=>c.objects.length&&c.good>=Math.min(3,c.objects.length));
  candidates.sort((a,b)=>b.score-a.score||b.objects.length-a.objects.length);
  return candidates[0]||null;
}
async function parsePayload(env,capture){
  if(!capture?.r2_object_key)throw new Error(`Roster capture ${capture?.route_path||''} has no R2 object key.`);
  const obj=await env.COMPANION_EXPORTS.get(capture.r2_object_key);
  if(!obj)throw new Error(`The private roster payload could not be found in R2 for ${capture.route_path}.`);
  const raw=new TextDecoder('utf-8',{fatal:false}).decode(await obj.arrayBuffer()).trim();
  if(!raw)throw new Error(`The captured roster payload is empty for ${capture.route_path}.`);
  try{return JSON.parse(raw);}catch{throw new Error(`The captured roster payload is not valid JSON for ${capture.route_path}.`);}
}
function routeTeamId(path){const match=String(path||'').match(ROSTER_ROUTE);return match?decodeURIComponent(match[1]):null;}
function latestByRoute(rows){
  const selected=new Map();
  for(const row of rows){
    const current=selected.get(row.route_path);
    if(!current||String(row.received_at)>String(current.received_at))selected.set(row.route_path,row);
  }
  return [...selected.values()];
}
async function rosterCaptureSet(db,leagueId){
  const sessionResult=await db.prepare(`SELECT discovery_session_id session_id,
      COUNT(DISTINCT route_path) route_count,
      MAX(received_at) latest_received
    FROM companion_route_captures
    WHERE league_id=? AND route_path LIKE '%/team/%/roster'
      AND discovery_session_id IS NOT NULL AND discovery_session_id<>''
    GROUP BY discovery_session_id
    HAVING COUNT(DISTINCT route_path)>=32
    ORDER BY MAX(received_at) DESC
    LIMIT 8`).bind(leagueId).all();

  const sessions=(sessionResult.results||[]).map(row=>({
    sessionId:String(row.session_id),
    routeCount:Number(row.route_count||0),
    latestReceived:row.latest_received
  }));

  if(sessions.length){
    const chosen=sessions[0];
    const result=await db.prepare(`SELECT c.id capture_id,c.discovery_session_id,c.route_path,c.r2_object_key,c.received_at,
        COALESCE(i.dataset_type,'unknown') dataset_type,COALESCE(i.record_count,0) record_count
      FROM companion_route_captures c
      LEFT JOIN companion_dataset_inspections i ON i.capture_id=c.id
      WHERE c.league_id=? AND c.discovery_session_id=? AND c.route_path LIKE '%/team/%/roster'
      ORDER BY c.received_at DESC`).bind(leagueId,chosen.sessionId).all();

    const rows=latestByRoute((result.results||[]).filter(row=>ROSTER_ROUTE.test(String(row.route_path||''))));
    rows.sort((a,b)=>String(a.route_path).localeCompare(String(b.route_path)));

    if(rows.length>=32){
      return{
        captures:rows,
        sessionId:chosen.sessionId,
        availableRoutes:rows.map(r=>r.route_path),
        sessionDiagnostics:sessions,
        strategy:'latest-complete-session'
      };
    }
  }

  // Compatibility fallback for receiver versions that split requests across session IDs.
  // Bound the scan to recent captures instead of reading the entire league history.
  const fallback=await db.prepare(`SELECT c.id capture_id,c.discovery_session_id,c.route_path,c.r2_object_key,c.received_at,
      COALESCE(i.dataset_type,'unknown') dataset_type,COALESCE(i.record_count,0) record_count
    FROM companion_route_captures c
    LEFT JOIN companion_dataset_inspections i ON i.capture_id=c.id
    WHERE c.league_id=? AND c.route_path LIKE '%/team/%/roster'
    ORDER BY c.received_at DESC LIMIT 256`).bind(leagueId).all();

  const all=(fallback.results||[]).filter(row=>ROSTER_ROUTE.test(String(row.route_path||'')));
  const combined=latestByRoute(all);
  combined.sort((a,b)=>String(a.route_path).localeCompare(String(b.route_path)));

  return{
    captures:combined,
    sessionId:'aggregated-latest-rosters',
    availableRoutes:combined.map(r=>r.route_path),
    sessionDiagnostics:sessions,
    strategy:'bounded-aggregated-fallback'
  };
}

async function latestUsableFreeAgentCapture(db,env,leagueId){
  const result=await db.prepare(`SELECT id capture_id,discovery_session_id,route_path,r2_object_key,received_at,byte_length
    FROM companion_route_captures
    WHERE league_id=? AND LOWER(route_path) LIKE '%/freeagents/roster%'
    ORDER BY received_at DESC LIMIT 20`).bind(leagueId).all();

  const attempts=[];
  for(const capture of result.results||[]){
    if(!FREE_AGENT_ROUTE.test(String(capture.route_path||'')))continue;
    try{
      const payload=await parsePayload(env,capture);
      const collection=chooseCollection(payload);
      const explicitList=Array.isArray(payload?.rosterInfoList)?payload.rosterInfoList:null;
      const objects=explicitList||collection?.objects||[];
      const success=payload?.success!==false && objects.length>0;
      attempts.push({
        captureId:capture.capture_id,
        routePath:capture.route_path,
        receivedAt:capture.received_at,
        payloadSuccess:payload?.success??null,
        recordCount:objects.length,
        message:text(payload?.message),
        usable:success
      });
      if(success)return{capture,payload,objects,attempts};
    }catch(error){
      attempts.push({
        captureId:capture.capture_id,
        routePath:capture.route_path,
        receivedAt:capture.received_at,
        recordCount:0,
        usable:false,
        message:error?.message||String(error)
      });
    }
  }
  return{capture:null,payload:null,objects:[],attempts};
}
function normalizePosition(v){const p=text(v)?.toUpperCase();const map={HB:'RB'};return p?map[p]||p:null;}
function normalizeDev(v){const s=text(v);if(!s)return null;const n=Number(s);if(Number.isFinite(n)){return ({0:'Normal',1:'Star',2:'Superstar',3:'X-Factor'})[n]||s;}const l=s.toLowerCase().replace(/[_-]/g,' ');if(l.includes('x')&&l.includes('factor'))return 'X-Factor';if(l.includes('superstar'))return 'Superstar';if(l.includes('star'))return 'Star';if(l.includes('normal'))return 'Normal';return s;}
function heightInches(v){if(v==null)return null;if(Number.isFinite(Number(v)))return int(v);const m=String(v).match(/(\d+)\D+(\d+)/);return m?Number(m[1])*12+Number(m[2]):null;}
function retiredRecord(record={}){
  if(bool(first(record,A.retired)))return true;
  const status=String(first(record,A.rosterStatus)??'').trim().toLowerCase();
  return /(^|\b)(retired|retirement)(\b|$)/i.test(status);
}

function canonical(record,index,sourceTeamId,validTeams){
  if(retiredRecord(record))return {retired:true,sourceRecord:record};

  const firstName=text(first(record,A.firstName)),lastName=text(first(record,A.lastName));
  const displayName=text(first(record,A.displayName))||[firstName,lastName].filter(Boolean).join(' ')||`Player ${index+1}`;
  const externalId=text(first(record,A.id))||`generated-player-${sourceTeamId||'unknown'}-${index+1}`;
  const injury=text(first(record,A.injury));
  const recordTeamId=text(first(record,A.teamId));
  let teamExternalId=null;
  for(const candidate of [recordTeamId,text(sourceTeamId)]){
    if(candidate&&validTeams.has(String(candidate))){teamExternalId=String(candidate);break;}
  }
  const ratings={};for(const [k,v] of Object.entries(record||{})){if(typeof v==='number'&&/(speed|accel|agility|awareness|throw|catch|route|tackle|block|strength|power|accuracy|coverage|pursuit|playrec)/i.test(k))ratings[k]=v;}
  return {externalId,teamExternalId,recordTeamId,sourceTeamId:text(sourceTeamId),firstName,lastName,displayName,position:normalizePosition(first(record,A.position)),archetype:text(first(record,A.archetype)),overall:int(first(record,A.overall)),developmentTrait:normalizeDev(first(record,A.dev)),age:int(first(record,A.age)),yearsPro:int(first(record,A.yearsPro)),jerseyNumber:int(first(record,A.jersey)),heightInches:heightInches(first(record,A.height)),weightLbs:int(first(record,A.weight)),college:text(first(record,A.college)),injuryStatus:injury,isInjured:bool(first(record,A.injured))||Boolean(injury&&!/none|healthy/i.test(injury)),contractYearsRemaining:int(first(record,A.contractYears)),salary:money(first(record,A.salary)),capHit:money(first(record,A.capHit)),portraitId:text(first(record,A.portrait)),ratings,sourceRecord:record};
}
async function teamIds(db,leagueId){const run=await db.prepare(`SELECT id FROM companion_team_mapping_runs WHERE league_id=? AND status='pending-preview' ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();if(!run)return new Set();const r=await db.prepare(`SELECT external_id FROM companion_canonical_teams_preview WHERE league_id=? AND mapping_run_id=?`).bind(leagueId,run.id).all();return new Set((r.results||[]).map(x=>String(x.external_id)));}
async function latestRun(db,leagueId){return db.prepare(`SELECT * FROM companion_player_mapping_runs WHERE league_id=? ORDER BY created_at DESC LIMIT 1`).bind(leagueId).first();}
async function preview(db,leagueId,runId){if(!runId)return[];const r=await db.prepare(`SELECT external_id,team_external_id,first_name,last_name,display_name,position,archetype,overall,development_trait,age,years_pro,jersey_number,height_inches,weight_lbs,college,injury_status,is_injured,contract_years_remaining,salary,cap_hit,portrait_id FROM companion_canonical_players_preview WHERE league_id=? AND mapping_run_id=? ORDER BY team_external_id,overall DESC,display_name`).bind(leagueId,runId).all();return (r.results||[]).map(x=>({externalId:x.external_id,teamExternalId:x.team_external_id,firstName:x.first_name,lastName:x.last_name,displayName:x.display_name,position:x.position,archetype:x.archetype,overall:x.overall,developmentTrait:x.development_trait,age:x.age,yearsPro:x.years_pro,jerseyNumber:x.jersey_number,heightInches:x.height_inches,weightLbs:x.weight_lbs,college:x.college,injuryStatus:x.injury_status,isInjured:Boolean(x.is_injured),contractYearsRemaining:x.contract_years_remaining,salary:x.salary,capHit:x.cap_hit,portraitId:x.portrait_id}));}
function runPayload(run){if(!run)return null;let warnings=[];try{warnings=JSON.parse(run.warnings_json||'[]')}catch{}return{id:run.id,discoverySessionId:run.discovery_session_id,sourceCaptureId:run.source_capture_id,sourceRoutePath:run.source_route_path,status:run.status,playerCount:run.player_count,rosteredCount:run.rostered_count,freeAgentCount:run.free_agent_count,warningCount:run.warning_count,warnings,createdAt:run.created_at,updatedAt:run.updated_at};}
function response(run,players,slug,leagueId,extra={}){return{ok:true,release:RELEASE,leagueId,leagueSlug:slug,previewAvailable:Boolean(run),mappingRun:runPayload(run),players,activeSnapshotChanged:false,activationPerformed:false,rawPayloadReturned:false,...extra};}
async function runBatches(db,statements,size=150){for(let i=0;i<statements.length;i+=size)await db.batch(statements.slice(i,i+size));}

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const db=database(context.env);if(!db)return json({ok:false,error:'D1 is not configured.'},503);
  const league=await resolveLeague(context.env,slug);if(!league)return json({ok:false,error:'League not found.'},404);
  const run=await latestRun(db,league.id);return json(response(run,await preview(db,league.id,run?.id),slug,league.id));
}

export async function onRequestPost(context){
  const slug=normalizeLeagueSlug(context);if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  let requestBody={};try{requestBody=await context.request.json()}catch{}
  const compact=Boolean(requestBody?.compact);
  const auth=await requireCommissioner(context);if(!auth.authorized)return auth.response;
  const db=database(context.env);if(!db||!context.env.COMPANION_EXPORTS?.get)return json({ok:false,error:'D1 and R2 must be configured.'},503);
  const league=await resolveLeague(context.env,slug);if(!league)return json({ok:false,error:'League not found.'},404);
  if(auth.session.membership?.leagueId!==league.id)return json({ok:false,error:'Commissioner membership does not match this league.'},403);
  try{
    const source=await rosterCaptureSet(db,league.id);
    if(!source.captures.length)return json({ok:false,error:'No team roster payloads have been captured yet.',detail:'Run the Madden Companion export with Rosters selected, then classify the latest export.',availableRoutes:source.availableRoutes},404);
    const validTeams=await teamIds(db,league.id);if(!validTeams.size)return json({ok:false,error:'Map the canonical Teams preview before mapping players.'},409);

    const warnings=[],diagnostics=[],players=[],seen=new Set();let rostered=0,freeAgents=0;
    const parsedCaptures=await Promise.all(source.captures.map(async capture=>{
      const sourceTeamId=routeTeamId(capture.route_path);
      try{
        const payload=await parsePayload(context.env,capture);
        const collection=chooseCollection(payload);
        return {capture,sourceTeamId,collection,error:null};
      }catch(error){
        return {capture,sourceTeamId,collection:null,error};
      }
    }));

    for(const item of parsedCaptures){
      const {capture,sourceTeamId,collection,error}=item;
      if(error){
        warnings.push(`${capture.route_path}: ${error?.message||String(error)}`);
        diagnostics.push({routePath:capture.route_path,sourceTeamId,accepted:false,reason:error?.message||String(error)});
        continue;
      }
      if(!collection){
        warnings.push(`No player-shaped roster collection found in ${capture.route_path}.`);
        diagnostics.push({routePath:capture.route_path,sourceTeamId,accepted:false,reason:'No player-shaped array found.'});
        continue;
      }
      diagnostics.push({routePath:capture.route_path,sourceTeamId,collectionPath:collection.path,recordCount:collection.objects.length,shapeScore:Number(collection.score.toFixed(2)),accepted:true});
      for(let i=0;i<collection.objects.length;i++){
        const p=canonical(collection.objects[i],i,sourceTeamId,validTeams);
        if(p.retired)continue;
        if(seen.has(p.externalId)){warnings.push(`Duplicate player ID skipped: ${p.externalId} from ${capture.route_path}.`);continue;}
        seen.add(p.externalId);
        if(p.externalId.startsWith('generated-player-'))warnings.push(`Generated missing player ID for ${p.displayName}.`);
        if(!p.position)warnings.push(`Missing position for ${p.displayName}.`);
        if(p.teamExternalId)rostered++;
        else{
          freeAgents++;
          const supplied=p.recordTeamId||p.sourceTeamId;
          if(supplied&&!['0','-1','null'].includes(String(supplied)))warnings.push(`Unknown team ID ${supplied} for ${p.displayName}; treated as unassigned.`);
        }
        players.push(p);
      }
    }

    // 5.9.10.6.1c: Madden exposes Free Agents as a separate league-level roster.
    // Only merge a capture when the response is explicitly usable and non-empty.
    const freeAgentSource=await latestUsableFreeAgentCapture(db,context.env,league.id);
    if(freeAgentSource.capture){
      diagnostics.push({
        routePath:freeAgentSource.capture.route_path,
        sourceTeamId:'FA',
        collectionPath:'$.rosterInfoList',
        recordCount:freeAgentSource.objects.length,
        accepted:true,
        dataset:'free-agents'
      });
      for(let i=0;i<freeAgentSource.objects.length;i++){
        const p=canonical(freeAgentSource.objects[i],i,'FA',validTeams);
        if(p.retired)continue;
        if(seen.has(p.externalId)){
          // A currently rostered player wins over the Free Agent source.
          continue;
        }
        seen.add(p.externalId);
        p.teamExternalId=null;
        p.sourceTeamId='FA';
        if(p.externalId.startsWith('generated-player-'))warnings.push(`Generated missing Free Agent player ID for ${p.displayName}.`);
        if(!p.position)warnings.push(`Missing position for Free Agent ${p.displayName}.`);
        freeAgents++;
        players.push(p);
      }
    }else{
      const latestAttempt=freeAgentSource.attempts?.[0]||null;
      warnings.push(latestAttempt
        ? `Free Agent roster was captured but is not usable yet: ${latestAttempt.message||'empty rosterInfoList or success=false'}.`
        : 'No Free Agent roster capture is available yet. Export the Madden Free Agents roster, then rerun the import.');
      diagnostics.push({
        routePath:'xbsx/{franchiseId}/freeagents/roster',
        sourceTeamId:'FA',
        accepted:false,
        dataset:'free-agents',
        reason:latestAttempt?.message||'No successful non-empty Free Agent capture is available.',
        attempts:freeAgentSource.attempts||[]
      });
    }

    if(!players.length)return json({ok:false,error:'No canonical players were produced from the captured team rosters.',rosterRouteCount:source.captures.length,rosterDiagnostics:diagnostics},422);

    await db.prepare(`UPDATE companion_player_mapping_runs SET status='superseded',updated_at=? WHERE league_id=? AND status='pending-preview'`).bind(new Date().toISOString(),league.id).run();
    const runId=crypto.randomUUID(),now=new Date().toISOString();
    const representative=source.captures[0];
    const routeSummary=`${source.captures.length} team roster routes + ${freeAgentSource.capture?'1 usable':'0 usable'} Free Agent roster route`;
    await db.prepare(`INSERT INTO companion_player_mapping_runs (id,league_id,discovery_session_id,source_capture_id,source_route_path,status,player_count,rostered_count,free_agent_count,warning_count,warnings_json,created_at,updated_at) VALUES (?,?,?,?,?,'pending-preview',?,?,?,?,?,?,?)`).bind(runId,league.id,source.sessionId||representative.discovery_session_id,representative.capture_id,routeSummary,players.length,rostered,freeAgents,warnings.length,JSON.stringify(warnings),now,now).run();

    const insertSql=`INSERT INTO companion_canonical_players_preview (mapping_run_id,league_id,external_id,team_external_id,first_name,last_name,display_name,position,archetype,overall,development_trait,age,years_pro,jersey_number,height_inches,weight_lbs,college,injury_status,is_injured,contract_years_remaining,salary,cap_hit,portrait_id,ratings_json,source_record_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const statements=players.map(p=>db.prepare(insertSql).bind(runId,league.id,p.externalId,p.teamExternalId,p.firstName,p.lastName,p.displayName,p.position,p.archetype,p.overall,p.developmentTrait,p.age,p.yearsPro,p.jerseyNumber,p.heightInches,p.weightLbs,p.college,p.injuryStatus,p.isInjured?1:0,p.contractYearsRemaining,p.salary,p.capHit,p.portraitId,JSON.stringify(p.ratings),JSON.stringify(p.sourceRecord),now));
    await runBatches(db,statements);
    const run=await latestRun(db,league.id);
    const responsePlayers=compact?[]:await preview(db,league.id,run.id);
    return json(response(run,responsePlayers,slug,league.id,{
      compact,
      playerCount:players.length,
      rosterRouteCount:source.captures.length,
      expectedTeamCount:validTeams.size,
      freeAgentCapture:{
        usable:Boolean(freeAgentSource.capture),
        captureId:freeAgentSource.capture?.capture_id||null,
        routePath:freeAgentSource.capture?.route_path||'xbsx/{franchiseId}/freeagents/roster',
        recordCount:freeAgentSource.objects?.length||0,
        attempts:freeAgentSource.attempts||[]
      },
      rosterDiagnostics:diagnostics,
      sessionDiagnostics:source.sessionDiagnostics,
      rosterSelectionStrategy:source.strategy||'unknown'
    }));
  }catch(error){return json({ok:false,error:'Player roster aggregation failed.',detail:error?.message||String(error),release:RELEASE},500);}
}
