import { json,database,normalizeLeagueSlug,validLeagueSlug,resolveLeague } from '../../../_lib/cloud-platform.js';
import { requireActiveMembership,requireCommissioner } from '../../../_lib/permissions.js';
import { requireDatabaseSchema } from '../../../_lib/database-schema.js';
import { activeLeagueTeams,resolveTeam,canonicalTeamKey } from '../../../_lib/league-teams.js';
import { normalizePlayer } from './snapshot/read-model.js';
import { currentFranchiseContext } from '../../../_lib/ownership-periods.js';
import { playerOwnershipStatement } from '../../../_lib/roster-ownership.js';
import { createTenantAuditContext,tenantAuditStatement } from '../../../_lib/tenant-context.js';

const RELEASE='8.0.1';
const clean=(value,max=160)=>String(value??'').trim().slice(0,max);
const parse=value=>{try{return JSON.parse(value || '{}')}catch{return{}}};
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results || [];
const failure=(message,status=422)=>Object.assign(new Error(message),{status});
async function state(context,commissioner=false) {
  const auth=await(commissioner?requireCommissioner(context):requireActiveMembership(context));
  if(!auth.authorized)return{response:auth.response};
  const slug=normalizeLeagueSlug(context),db=database(context.env);
  if(!validLeagueSlug(slug))return{response:json({ok:false,error:'Invalid league slug.'},400)};
  const league=await resolveLeague(context.env,slug);
  if(!db || !league || auth.session.membership?.leagueId!==league.id)return{response:json({ok:false,error:'Not found.'},404)};
  await requireDatabaseSchema(db);
  return{db,league,session:auth.session,request:context.request,teams:await activeLeagueTeams(db,league.id),period:await currentFranchiseContext(db,league.id)};
}

function playerSummary(row,teams) {
  const player=normalizePlayer(parse(row.data_json),row.public_id);
  const sourceTeam=resolveTeam(teams,player.teamId);
  return {assetType:'player',assetId:row.player_identity_id,playerPublicId:row.public_id,sourcePlayerId:row.source_player_id,
    name:player.displayName,position:player.position,overall:player.overall,age:player.age,development:player.devTrait,
    teamKey:canonicalTeamKey(row.current_team_key || row.overlay_team_key || sourceTeam?.teamKey),sourceTeamKey:sourceTeam?.teamKey || null,
    revision:Number(row.revision || 0)};
}
const playerQuery=`WITH identity_map AS MATERIALIZED (
  SELECT alias.source_player_id,MAX(identity.id) AS player_identity_id,MAX(identity.public_id) AS public_id,
    MAX(ownership.current_team_key) AS current_team_key,MAX(ownership.revision) AS revision,MAX(overlay.to_team_key) AS overlay_team_key
  FROM player_source_aliases alias JOIN player_identities identity ON identity.league_id=alias.league_id AND identity.id=alias.player_identity_id
  LEFT JOIN league_player_ownership ownership ON ownership.league_id=alias.league_id AND ownership.player_identity_id=alias.player_identity_id
  LEFT JOIN trade_roster_overlays overlay ON overlay.league_id=alias.league_id AND overlay.player_identity_id=alias.player_identity_id AND overlay.internal_status='active'
  WHERE alias.league_id=? GROUP BY alias.source_player_id
) SELECT mapping.*,record.data_json FROM league_snapshot_records record
  JOIN identity_map mapping ON mapping.source_player_id=record.external_id
  WHERE record.league_id=? AND record.snapshot_id=? AND record.domain='players'`;
async function directory(c,url) {
  if(!c.period.snapshotId)throw failure('Import a roster before managing ownership.',409);
  const type=url.searchParams.get('type') || 'draft-pick',teamQuery=clean(url.searchParams.get('team')),query=clean(url.searchParams.get('q')).toLowerCase();
  if(!['player','draft-pick'].includes(type))throw failure('Choose players or draft picks.');
  const team=teamQuery?resolveTeam(c.teams,teamQuery):null;
  if(teamQuery&&!team)throw failure('Choose a current league team.');
  const offset=Math.max(0,Math.min(6000,Math.trunc(Number(url.searchParams.get('offset')) || 0))),limit=40;
  let items;
  if(type==='draft-pick') {
    items=(await rows(c.db,`SELECT id,draft_class,round,original_team_key,current_team_key,revision FROM league_draft_picks
      WHERE league_id=? AND franchise_season_id=? AND (?='' OR current_team_key=?)
        AND (?='' OR instr(lower(draft_class || ' round ' || round || ' ' || original_team_key || ' ' || current_team_key),?)>0)
      ORDER BY draft_class,round,original_team_key LIMIT ? OFFSET ?`,c.league.id,c.period.franchiseSeasonId,team?.teamKey || '',team?.teamKey || '',query,query,limit+1,offset))
      .map(pick=>({assetType:'draft-pick',assetId:pick.id,name:`${pick.draft_class} Round ${pick.round} (${pick.original_team_key.toUpperCase()})`,
        draftClass:Number(pick.draft_class),round:Number(pick.round),originalTeamKey:pick.original_team_key,teamKey:pick.current_team_key,revision:Number(pick.revision)}));
  } else {
    // Filter and paginate in D1: never transfer/parse the full roster just to show 40 rows.
    const sourceTeam=`lower(CAST(COALESCE(json_extract(record.data_json,'$.team_external_id'),json_extract(record.data_json,'$.teamId'),json_extract(record.data_json,'$.team_id'),'') AS TEXT))`;
    const name=`COALESCE(json_extract(record.data_json,'$.display_name'),json_extract(record.data_json,'$.displayName'),json_extract(record.data_json,'$.name'),'')`;
    const ownerKeys=[...new Set(c.teams.flatMap(value=>[value.teamKey,value.externalId,value.abbreviation].filter(Boolean).map(value=>String(value).toLowerCase())))];
    const found=await rows(c.db,`${playerQuery}
      AND (mapping.current_team_key IS NOT NULL OR mapping.overlay_team_key IS NOT NULL OR ${sourceTeam} IN (SELECT value FROM json_each(?)))
      AND (?='' OR COALESCE(mapping.current_team_key,mapping.overlay_team_key)=? OR
        (mapping.current_team_key IS NULL AND mapping.overlay_team_key IS NULL AND ${sourceTeam} IN (?,?,?)))
      AND (?='' OR instr(lower(${name} || ' ' || COALESCE(json_extract(record.data_json,'$.position'),'')),?)>0)
      ORDER BY lower(${name}),record.external_id LIMIT ? OFFSET ?`,c.league.id,c.league.id,c.period.snapshotId,JSON.stringify(ownerKeys),
        team?.teamKey || '',team?.teamKey || '',String(team?.externalId || '').toLowerCase(),team?.teamKey || '',String(team?.abbreviation || '').toLowerCase(),query,query,limit+1,offset);
    items=found.map(row=>playerSummary(row,c.teams));
  }
  return {ok:true,release:RELEASE,snapshotId:c.period.snapshotId,canManage:c.session.membership.role==='commissioner',
    teams:c.teams,items:items.slice(0,limit),nextOffset:items.length>limit?offset+limit:null};
}
export async function rosterMovementAsset(c,type,id) {
  if(type==='draft-pick') {
    const pick=await c.db.prepare(`SELECT id,draft_class,round,original_team_key,current_team_key,revision FROM league_draft_picks
      WHERE league_id=? AND id=? AND franchise_season_id=?`).bind(c.league.id,id,c.period.franchiseSeasonId).first();
    if(!pick)throw failure('This draft pick is not in the current league season.',404);
    return {assetType:type,assetId:pick.id,name:`${pick.draft_class} Round ${pick.round} (${pick.original_team_key.toUpperCase()})`,teamKey:pick.current_team_key,revision:Number(pick.revision)};
  }
  if(type!=='player')throw failure('Choose players or draft picks.');
  const found=await rows(c.db,`${playerQuery} AND (mapping.player_identity_id=? OR mapping.public_id=? OR record.external_id=?)
    ORDER BY record.external_id LIMIT 1`,c.league.id,c.league.id,c.period.snapshotId,id,id,id);
  if(!found.length)throw failure('This player is not on the current league roster.',404);
  return playerSummary(found[0],c.teams);
}
function matchesReplay(row,body,actor) {
  return row.actor_user_id===actor && row.asset_type===body.assetType && (row.player_identity_id || row.draft_pick_id)===body.assetId
    && row.from_team_key===body.fromTeamKey && row.to_team_key===body.toTeamKey && row.expected_revision===body.expectedRevision
    && row.source_snapshot_id===body.snapshotId && row.reason===body.reason;
}
export async function moveRosterAsset(c,input) {
  if(c.session.membership.role!=='commissioner')throw failure('Commissioner access is required.',403);
  if(!input || typeof input!=='object' || Array.isArray(input))throw failure('A roster move object is required.',400);
  const body={requestId:clean(input.requestId,80),assetType:clean(input.assetType,16),assetId:clean(input.assetId,300),
    fromTeamKey:canonicalTeamKey(input.fromTeamKey),toTeamKey:canonicalTeamKey(input.toTeamKey),
    expectedRevision:input.expectedRevision,snapshotId:clean(input.snapshotId,100),reason:clean(input.reason,500)};
  if(!/^[a-f0-9-]{36}$/i.test(body.requestId) || !Number.isInteger(body.expectedRevision) || body.expectedRevision<0)throw failure('Refresh and confirm this move again.');
  const prior=await c.db.prepare(`SELECT * FROM commissioner_roster_movements WHERE league_id=? AND request_id=?`).bind(c.league.id,body.requestId).first();
  if(prior){if(!matchesReplay(prior,body,c.session.user.id))throw failure('This request has already been used for another move.',409);return{ok:true,movementId:prior.id,replayed:true};}
  if(!c.period.snapshotId || body.snapshotId!==c.period.snapshotId)throw failure('The roster snapshot changed. Refresh and try again.',409);
  const asset=await rosterMovementAsset(c,body.assetType,body.assetId),to=resolveTeam(c.teams,body.toTeamKey),from=resolveTeam(c.teams,body.fromTeamKey);
  if(asset.assetId!==body.assetId)throw failure('Use the asset ID supplied by the roster directory.');
  if(!from || !to || from.teamKey===to.teamKey)throw failure('Choose different current league teams.');
  if(asset.teamKey!==from.teamKey || asset.revision!==body.expectedRevision)throw failure('Ownership changed. Refresh and try again.',409);
  const id=`roster_move_${body.requestId}`,actor=c.session.user.id;
  const statements=[c.db.prepare(`INSERT INTO commissioner_roster_movements
    (id,league_id,request_id,asset_type,player_identity_id,draft_pick_id,source_player_id,asset_name,from_team_key,to_team_key,
      source_team_key,expected_revision,source_snapshot_id,actor_user_id,reason)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,c.league.id,body.requestId,asset.assetType,
      asset.assetType==='player'?asset.assetId:null,asset.assetType==='draft-pick'?asset.assetId:null,asset.sourcePlayerId || null,
      asset.name,from.teamKey,to.teamKey,asset.sourceTeamKey || null,asset.revision,c.period.snapshotId,actor,body.reason)];
  if(asset.assetType==='player') {
    statements.push(playerOwnershipStatement(c.db,{leagueId:c.league.id,playerIdentityId:asset.assetId,sourcePlayerId:asset.sourcePlayerId,
      toTeamKey:to.teamKey,snapshotId:c.period.snapshotId,actorUserId:actor,sourceType:'commissioner'}));
    statements.push(c.db.prepare(`UPDATE trade_roster_overlays SET internal_status='superseded',resolved_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND player_identity_id=? AND internal_status='active'`).bind(c.league.id,asset.assetId));
  } else {
    statements.push(c.db.prepare(`UPDATE league_draft_picks SET current_team_key=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND id=? AND revision=? AND current_team_key=?`).bind(to.teamKey,c.league.id,asset.assetId,asset.revision,from.teamKey));
    statements.push(c.db.prepare(`INSERT INTO draft_pick_ledger_events
      (id,league_id,draft_pick_id,event_type,from_team_key,to_team_key,detail_json,created_by_user_id)
      VALUES (?,?,?,'commissioner-correction',?,?,?,?)`).bind(`pick_event_${body.requestId}`,c.league.id,asset.assetId,from.teamKey,to.teamKey,JSON.stringify({movementId:id,reason:body.reason,expectedRevision:asset.revision}),actor));
  }
  statements.push(c.db.prepare(`UPDATE trade_block_listings SET active=0,updated_at=CURRENT_TIMESTAMP
    WHERE league_id=? AND active=1 AND ${asset.assetType==='player'?'player_identity_id':'draft_pick_id'}=?`).bind(c.league.id,asset.assetId));
  const details={movementId:id,assetType:asset.assetType,assetName:asset.name,assetId:asset.assetId,fromTeamKey:from.teamKey,toTeamKey:to.teamKey,reason:body.reason,actorName:c.session.user.displayName || 'Commissioner'};
  const audit=createTenantAuditContext({request:c.request},c.league,c.session,'commissioner_roster_moved');
  statements.push(tenantAuditStatement(c.db,audit,{resourceType:asset.assetType,resourceId:asset.assetId,detail:details}));
  // Member-visible Transactions is the public audit companion to the protected commissioner audit.
  const moves=[{assetType:asset.assetType,playerId:asset.assetType==='player'?asset.sourcePlayerId:null,playerName:asset.name,position:asset.position || null,
    overall:asset.overall ?? null,draftPickId:asset.assetType==='draft-pick'?asset.assetId:null,fromTeamId:from.teamKey,toTeamId:to.teamKey}],playerIds=asset.assetType==='player'?[asset.sourcePlayerId]:[];
  const participants=asset.assetType==='player'?[{id:asset.sourcePlayerId,name:asset.name,position:asset.position,overall:asset.overall}]:[];
  for(const table of ['canonical_transactions','league_transaction_history']) {
    const history=table==='league_transaction_history';
    statements.push(c.db.prepare(`INSERT INTO ${table}
      (id,league_id,event_type,status,authority,execution_status,season,week,occurred_at,team_ids_json,player_ids_json,confidence,details_json${history?',participants_json,movements_json,source_types_json,source_count':''})
      VALUES (?,?,'roster-adjustment','recorded','commissioner','completed',?,?,CURRENT_TIMESTAMP,?,?,'confirmed',?${history?',?,?,?,1':''})`)
      .bind(`${id}_transaction`,c.league.id,c.period.seasonYear,c.period.week,JSON.stringify([from.teamKey,to.teamKey]),JSON.stringify(playerIds),JSON.stringify(details),
        ...(history?[JSON.stringify(participants),JSON.stringify(moves),'["commissioner-roster-move"]']:[])));
  }
  statements.push(c.db.prepare(`INSERT INTO canonical_transaction_evidence
    (id,league_id,transaction_id,source_type,source_key,snapshot_id,evidence_json)
    VALUES (?,?,?,'commissioner-roster-move',?,?,?)`).bind(`${id}_evidence`,c.league.id,`${id}_transaction`,id,c.period.snapshotId,
      JSON.stringify({eventType:'roster-adjustment',season:c.period.seasonYear,week:c.period.week,summary:`${asset.name}: ${from.displayName} → ${to.displayName}`,moves,...details})));
  try {await c.db.batch(statements);}
  catch(error) {
    const replay=await c.db.prepare(`SELECT * FROM commissioner_roster_movements WHERE league_id=? AND request_id=?`).bind(c.league.id,body.requestId).first();
    if(replay&&matchesReplay(replay,body,actor))return{ok:true,movementId:replay.id,replayed:true};
    if(/ownership changed|snapshot changed/i.test(error.message))throw failure('Ownership or the roster snapshot changed. Refresh and try again.',409);
    throw error;
  }
  return{ok:true,release:RELEASE,movementId:id,replayed:false,asset:{...asset,teamKey:to.teamKey,revision:asset.revision+1}};
}

export async function onRequestGet(context) {
  try {
    const url=new URL(context.request.url),activity=url.searchParams.get('view')==='activity',c=await state(context,!activity);
    if(c.response)return c.response;
    if(activity)return json({ok:true,release:RELEASE,movements:await rows(c.db,`SELECT movement.id,movement.asset_type AS assetType,movement.asset_name AS assetName,
      movement.from_team_key AS fromTeamKey,movement.to_team_key AS toTeamKey,movement.reason,movement.created_at AS createdAt,users.display_name AS actorName
      FROM commissioner_roster_movements movement JOIN users ON users.id=movement.actor_user_id
      WHERE movement.league_id=? ORDER BY movement.created_at DESC,movement.id DESC LIMIT 50`,c.league.id)});
    return json(await directory(c,url));
  } catch(error){return json({ok:false,error:error.status?error.message:'Roster management is temporarily unavailable.'},error.status || 500);}
}
export async function onRequestPost(context) {
  try {
    const c=await state(context,true);if(c.response)return c.response;
    const raw=await context.request.text();if(raw.length>16384)return json({ok:false,error:'Request is too large.'},413);
    let body;try{body=JSON.parse(raw)}catch{return json({ok:false,error:'Invalid JSON.'},400)};
    if(!body || typeof body!=='object' || Array.isArray(body))return json({ok:false,error:'A roster move object is required.'},400);
    return json(await moveRosterAsset(c,body));
  } catch(error){return json({ok:false,error:error.status?error.message:'The move could not be saved. No partial move was applied.'},error.status || 500);}
}
