import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../../_lib/cloud-platform.js';

const RELEASE='5.9.10.6.4.6';
const FREE_AGENT_ROUTE=/\/free[-_]?agents?\/(?:roster|players)\/?$/i;

const text=v=>v==null?null:(String(v).trim()||null);
const int=v=>{const n=Number.parseInt(v,10);return Number.isFinite(n)?n:null};
const money=v=>{const n=Number(v);return Number.isFinite(n)?Math.round(n):null};

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


async function canonicalFreeAgents(db,leagueId){
  const exists=await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='canonical_free_agents'`).first();
  if(!exists)return[];
  const result=await db.prepare(`SELECT * FROM canonical_free_agents WHERE league_id=? ORDER BY player_name`).bind(leagueId).all();
  return (result.results||[]).map(row=>{
    const raw=(()=>{try{return JSON.parse(row.raw_json||'{}')}catch{return{}}})();
    return playerShape({
      ...raw,
      playerId:row.player_id,
      displayName:row.player_name,
      position:row.position,
      overall:row.overall,
      age:row.age,
      devTrait:row.dev_trait,
      teamId:'FA',
      rosterStatus:'free-agent',
      status:'free-agent'
    },0);
  }).filter(Boolean);
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

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,error:'Invalid league slug.'},400);
  const db=database(context.env),league=db?await resolveLeague(context.env,slug):null;
  if(!db||!league)return json({ok:false,error:'League not found.'},404);

  const rows=await captures(db,league.id);
  const attempts=[];
  let selected=null,players=[];
  const ledgerPlayers=await canonicalFreeAgents(db,league.id);

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
      players=list.map(playerShape).filter(Boolean);
    }
  }

  const merged=new Map();
  for(const player of ledgerPlayers)merged.set(String(player.id),player);
  for(const player of players)merged.set(String(player.id),player);
  const allPlayers=[...merged.values()];

  return json({
    ok:true,
    release:RELEASE,
    sourceRoute:'canonical-ledger + xbsx/{franchiseId}/freeagents/roster',
    captureAvailable:Boolean(rows.length),
    usableCaptureAvailable:Boolean(selected),
    selectedCapture:selected?{
      captureId:selected.id,
      routePath:selected.route_path,
      receivedAt:selected.received_at
    }:null,
    ledgerCount:ledgerPlayers.length,
    capturedCount:players.length,
    count:allPlayers.length,
    players:allPlayers,
    attempts
  });
}
