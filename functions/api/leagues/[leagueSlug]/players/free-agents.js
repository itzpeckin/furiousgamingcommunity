/* FHQ_BUILD: 5.9.10.6.5.4h-p5e4 */
import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';

const RELEASE='5.9.10.6.5.4h-p5e8';
const FREE_AGENT_ROUTE=/\/free[-_]?agents?\/(?:roster|players)\/?$/i;

const text=v=>v==null?null:(String(v).trim()||null);
const int=v=>{const n=Number.parseInt(v,10);return Number.isFinite(n)?n:null};
const money=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n):null};
const bool=v=>v===true||v===1||v==='1'||['true','yes'].includes(String(v??'').trim().toLowerCase());

function retiredRecord(raw={}){
  if(bool(raw.isRetired??raw.retired??raw.hasRetired))return true;
  const status=String(raw.rosterStatus??raw.roster_status??raw.playerStatus??raw.player_status??raw.status??raw.transactionStatus??'').trim();
  return /(^|\b)(retired|retirement)(\b|$)/i.test(status);
}

function normalizeDev(v){
  if(v==null)return null;
  const n=Number(v);
  if(Number.isFinite(n))return ({0:'Normal',1:'Star',2:'Superstar',3:'X-Factor'})[n]||String(v);
  const s=String(v).trim();
  return s||null;
}

function playerShape(raw,index){
  const first=text(raw.firstName??raw.first_name);
  const last=text(raw.lastName??raw.last_name);
  const name=text(raw.displayName??raw.fullName??raw.playerName??raw.name)||[first,last].filter(Boolean).join(' ')||`Free Agent ${index+1}`;
  const id=text(raw.playerId??raw.playerID??raw.player_id??raw.rosterId??raw.assetId??raw.id);
  if(!id)return null;
  return{
    id,
    externalId:id,
    name,
    displayName:name,
    firstName:first,
    lastName:last,
    teamId:'FA',
    teamExternalId:null,
    rosterStatus:'free-agent',
    status:'free-agent',
    position:text(raw.position??raw.positionName??raw.pos??raw.positionAbbr),
    overall:int(raw.overall??raw.overallRating??raw.ovr??raw.playerOverall),
    age:int(raw.age??raw.playerAge),
    yearsPro:int(raw.yearsPro??raw.experience??raw.exp),
    devTrait:normalizeDev(raw.developmentTrait??raw.devTrait??raw.development),
    developmentTrait:normalizeDev(raw.developmentTrait??raw.devTrait??raw.development),
    jerseyNumber:int(raw.jerseyNumber??raw.jersey??raw.number),
    salary:money(raw.salary??raw.totalSalary??raw.contractSalary),
    capHit:money(raw.capHit??raw.salaryCapHit??raw.cap),
    portraitId:text(raw.portraitId??raw.portraitID??raw.headshotId),
    source:{...raw,teamId:'FA',rosterStatus:'free-agent',status:'free-agent'}
  };
}

async function payloadFor(context,capture){
  if(!capture?.r2_object_key)return null;
  const object=await context.env.COMPANION_EXPORTS?.get?.(capture.r2_object_key);
  if(!object)return null;
  try{return JSON.parse(await object.text())}catch{return null}
}

async function captures(db,leagueId){
  const result=await db.prepare(`SELECT id,route_path,r2_object_key,received_at,byte_length
    FROM companion_route_captures
    WHERE league_id=? AND LOWER(route_path) LIKE '%free%agent%'
    ORDER BY received_at DESC LIMIT 20`).bind(leagueId).all();
  return (result.results||[]).filter(row=>FREE_AGENT_ROUTE.test(String(row.route_path||'')));
}

async function canonicalInferredFreeAgents(db,leagueId){
  try{
    const result=await db.prepare(`SELECT player_id,player_name,position,overall,age,dev_trait,raw_json,source_route,source_capture_id,updated_at
      FROM canonical_free_agents WHERE league_id=? ORDER BY player_name`).bind(leagueId).all();
    return result.results||[];
  }catch(error){
    console.warn('[Free Agents] canonical inferred read failed',error);
    return[];
  }
}

async function retiredPlayerIds(db,leagueId){
  const ids=new Set();

  // Historical directory explicit retirement state.
  try{
    const rows=(await db.prepare(`SELECT player_id FROM canonical_historical_player_directory
      WHERE league_id=? AND retired=1 LIMIT 2500`).bind(leagueId).all()).results||[];
    for(const row of rows)if(row.player_id!=null)ids.add(String(row.player_id));
  }catch{}

  // Explicit canonical retirement transactions.
  try{
    const rows=(await db.prepare(`SELECT player_ids_json FROM canonical_transactions
      WHERE league_id=? AND LOWER(event_type) IN ('retired','retirement')
      ORDER BY created_at DESC LIMIT 1000`).bind(leagueId).all()).results||[];
    for(const row of rows){
      try{
        const list=JSON.parse(row.player_ids_json||'[]');
        for(const id of Array.isArray(list)?list:[])if(id!=null)ids.add(String(id));
      }catch{}
    }
  }catch{}

  return ids;
}


function parseJson(value,fallback){
  try{return JSON.parse(value||'null')??fallback}catch{return fallback}
}

async function activeRosterIds(db,leagueId){
  try{
    const active=await db.prepare(`SELECT snapshot_id FROM league_active_snapshots
      WHERE league_id=? LIMIT 1`).bind(leagueId).first();
    if(!active?.snapshot_id)return new Set();

    const rows=(await db.prepare(`SELECT external_id,data_json
      FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain='players'`)
      .bind(leagueId,active.snapshot_id).all()).results||[];

    const ids=new Set();
    for(const row of rows){
      const raw=parseJson(row.data_json,{})||{};
      const id=text(
        row.external_id??
        raw.external_id??raw.externalId??
        raw.playerId??raw.player_id??raw.rosterId??raw.id
      );
      if(id)ids.add(String(id));
    }
    return ids;
  }catch{
    return new Set();
  }
}


async function snapshotPlayerIdentityByExternalIds(db,leagueId,playerIds){
  const wanted=new Set((playerIds||[]).map(String));
  const found=new Map();
  if(!wanted.size)return found;

  // Search recent player snapshot records and match every Madden ID alias.
  // This deliberately does not require canonical player_id == Madden playerId.
  try{
    const rows=(await db.prepare(`SELECT r.external_id,r.data_json,r.snapshot_id,r.created_at
      FROM league_snapshot_records r
      JOIN league_snapshots s ON s.snapshot_id=r.snapshot_id
      WHERE r.league_id=? AND r.domain='players'
      ORDER BY s.created_at DESC
      LIMIT 12000`).bind(leagueId).all()).results||[];

    for(const row of rows){
      const raw=parseJson(row.data_json,{})||{};
      const aliases=[
        row.external_id,raw.external_id,raw.externalId,raw.playerId,raw.player_id,
        raw.rosterId,raw.roster_id,raw.id,raw.maddenId,raw.madden_id
      ].filter(v=>v!==null&&v!==undefined&&String(v).trim()).map(String);

      const match=aliases.find(id=>wanted.has(id));
      if(!match||found.has(match))continue;

      found.set(match,{
        player_id:match,
        player_name:raw.displayName||raw.fullName||raw.playerName||raw.name||
          [raw.firstName,raw.lastName].filter(Boolean).join(' ')||null,
        position:raw.position||raw.pos||raw.positionName||null,
        overall:raw.overall??raw.overallRating??raw.ovr??null,
        age:raw.age??null,
        dev_trait:raw.devTrait??raw.developmentTrait??raw.dev_trait??null,
        raw_json:JSON.stringify(raw),
        last_seen_snapshot_id:row.snapshot_id,
        last_seen_at:row.created_at
      });
    }
  }catch{}
  return found;
}

async function transactionDerivedFreeAgents(db,leagueId,retiredIds,currentRosterIds){
  // We only need lifecycle transactions that can change FA state.
  const txRows=(await db.prepare(`SELECT id,event_type,player_ids_json,created_at,updated_at,occurred_at
    FROM canonical_transactions
    WHERE league_id=?
      AND LOWER(event_type) IN (
        'release','released',
        'signing','signed','waiver-claim',
        'drafted',
        'trade','team-change',
        'retired','retirement'
      )
    ORDER BY COALESCE(occurred_at,updated_at,created_at) ASC, created_at ASC
    LIMIT 5000`).bind(leagueId).all()).results||[];

  const state=new Map();

  for(const tx of txRows){
    const type=String(tx.event_type||'').toLowerCase();
    const ids=parseJson(tx.player_ids_json,[]);
    for(const rawId of Array.isArray(ids)?ids:[]){
      const playerId=String(rawId||'').trim();
      if(!playerId)continue;

      if(['retired','retirement'].includes(type)){
        state.set(playerId,'retired');
        continue;
      }

      if(['release','released'].includes(type)){
        state.set(playerId,'free-agent');
        continue;
      }

      if(['signing','signed','waiver-claim','drafted','trade','team-change'].includes(type)){
        state.set(playerId,'rostered');
      }
    }
  }

  const freeAgentIds=[...state.entries()]
    .filter(([playerId,status])=>
      status==='free-agent' &&
      !retiredIds.has(playerId) &&
      !currentRosterIds.has(playerId)
    )
    .map(([playerId])=>playerId);

  if(!freeAgentIds.length)return[];

  const identities=new Map();

  // Historical identity is authoritative for departed players.
  for(let i=0;i<freeAgentIds.length;i+=75){
    const ids=freeAgentIds.slice(i,i+75);
    const marks=ids.map(()=>'?').join(',');
    try{
      const rows=(await db.prepare(`SELECT player_id,player_name,position,overall,age,dev_trait,
          last_team_id,last_roster_status,raw_json,last_seen_snapshot_id,last_seen_at,retired
        FROM canonical_historical_player_directory
        WHERE league_id=? AND player_id IN (${marks})`)
        .bind(leagueId,...ids).all()).results||[];
      for(const row of rows)identities.set(String(row.player_id),row);
    }catch{}
  }

  // canonical_free_agents can contribute richer raw data where available.
  for(let i=0;i<freeAgentIds.length;i+=75){
    const ids=freeAgentIds.slice(i,i+75);
    const marks=ids.map(()=>'?').join(',');
    try{
      const rows=(await db.prepare(`SELECT player_id,player_name,position,overall,age,dev_trait,
          raw_json,source_route,source_capture_id,updated_at
        FROM canonical_free_agents
        WHERE league_id=? AND player_id IN (${marks})`)
        .bind(leagueId,...ids).all()).results||[];
      for(const row of rows){
        const id=String(row.player_id);
        identities.set(id,{...(identities.get(id)||{}),...row});
      }
    }catch{}
  }

  const snapshotIdentities=await snapshotPlayerIdentityByExternalIds(db,leagueId,freeAgentIds);
  for(const [id,snap] of snapshotIdentities){
    const old=identities.get(id)||{};
    identities.set(id,{
      ...snap,
      ...old,
      player_name:old.player_name||snap.player_name,
      position:old.position||snap.position,
      overall:old.overall??snap.overall,
      age:old.age??snap.age,
      dev_trait:old.dev_trait??snap.dev_trait,
      raw_json:(old.raw_json&&old.raw_json!=='{}')?old.raw_json:snap.raw_json,
      last_seen_snapshot_id:old.last_seen_snapshot_id||snap.last_seen_snapshot_id,
      last_seen_at:old.last_seen_at||snap.last_seen_at
    });
  }

  return freeAgentIds.map(playerId=>{
    const row=identities.get(playerId)||{};
    const raw=parseJson(row.raw_json,{})||{};
    return{
      player_id:playerId,
      player_name:row.player_name||raw.displayName||raw.fullName||raw.playerName||raw.name||`Player ${playerId}`,
      position:row.position||raw.position||raw.pos||null,
      overall:row.overall??raw.overall??raw.overallRating??raw.ovr??null,
      age:row.age??raw.age??null,
      dev_trait:row.dev_trait??raw.devTrait??raw.developmentTrait??null,
      raw_json:JSON.stringify({
        ...raw,
        playerId,
        displayName:row.player_name||raw.displayName||raw.fullName||raw.playerName||raw.name||`Player ${playerId}`,
        position:row.position||raw.position||raw.pos||null,
        overall:row.overall??raw.overall??raw.overallRating??raw.ovr??null,
        age:row.age??raw.age??null,
        devTrait:row.dev_trait??raw.devTrait??raw.developmentTrait??null,
        teamId:'FA',
        rosterStatus:'free-agent',
        status:'free-agent',
        isFreeAgent:true,
        transactionDerived:true,
        lastTeamId:row.last_team_id||raw.lastTeamId||null
      }),
      source_route:'transaction-derived',
      source_capture_id:row.last_seen_snapshot_id||row.source_capture_id||null,
      updated_at:row.last_seen_at||row.updated_at||null
    };
  });
}

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const db=database(context.env),league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league)return json({ok:false,error:'League not found.'},404);

  const retiredIds=await retiredPlayerIds(db,league.id);
  const currentRosterIds=await activeRosterIds(db,league.id);
  const rows=await captures(db,league.id);
  const attempts=[];
  let selected=null,players=[],retiredFiltered=0;

  for(const capture of rows){
    const payload=await payloadFor(context,capture);
    const list=Array.isArray(payload?.rosterInfoList)?payload.rosterInfoList:[];
    const success=payload?.success!==false && list.length>0;
    attempts.push({
      captureId:capture.id,
      routePath:capture.route_path,
      receivedAt:capture.received_at,
      byteLength:Number(capture.byte_length||0),
      payloadSuccess:payload?.success??null,
      recordCount:list.length,
      message:text(payload?.message),
      usable:success
    });
    if(!selected&&success){
      selected=capture;
      retiredFiltered=list.filter(retiredRecord).length;
      players=list.filter(raw=>!retiredRecord(raw)).map(playerShape).filter(Boolean)
        .filter(player=>!retiredIds.has(String(player.id)));
    }
  }

  const inferredRows=await transactionDerivedFreeAgents(
    db,league.id,retiredIds,currentRosterIds
  );
  const merged=new Map();
  for(const player of players){
    if(!player?.id)continue;
    const id=String(player.id);
    if(currentRosterIds.has(id))continue;
    if(retiredIds.has(id)||retiredRecord(player.source||player))continue;
    merged.set(id,player);
  }
  for(const row of inferredRows){
    const raw=(()=>{try{return JSON.parse(row.raw_json||'{}')}catch{return{}}})();
    if(retiredIds.has(String(row.player_id))||retiredRecord(raw))continue;
    const shaped=playerShape({
      ...raw,
      playerId:row.player_id,
      displayName:row.player_name||raw.displayName||raw.fullName,
      position:row.position||raw.position,
      overall:row.overall??raw.overall,
      age:row.age??raw.age,
      devTrait:row.dev_trait??raw.devTrait,
      teamId:'FA',rosterStatus:'free-agent',status:'free-agent',
      historicalPlayer:true,
      sourceRoute:row.source_route,
      sourceCaptureId:row.source_capture_id
    },merged.size);
    if(shaped&&!merged.has(String(shaped.id)))merged.set(String(shaped.id),shaped);
  }
  const mergedPlayers=[...merged.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));

  return json({
    ok:true,
    release:RELEASE,
    sourceRoute:'companion-freeagents + transaction-derived',
    captureAvailable:Boolean(rows.length),
    usableCaptureAvailable:Boolean(selected),
    selectedCapture:selected?{
      captureId:selected.id,
      routePath:selected.route_path,
      receivedAt:selected.received_at
    }:null,
    rawCompanionCount:players.length,
    inferredCount:inferredRows.length,
    transactionDerivedCount:inferredRows.length,
    currentRosterIdCount:currentRosterIds.size,
    resolvedIdentityCount:mergedPlayers.filter(p=>p?.name&&!/^Player\s+\d+$/i.test(String(p.name))).length,
    unresolvedIdentityCount:mergedPlayers.filter(p=>!p?.name||/^Player\s+\d+$/i.test(String(p.name))).length,
    count:mergedPlayers.length,
    retiredFiltered:retiredFiltered+retiredIds.size,
    explicitRetiredIdCount:retiredIds.size,
    players:mergedPlayers,
    attempts
  });
}
