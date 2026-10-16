import { sha256Hex } from './cloud-platform.js';
import { buildArchivedPlayerSeasonTotals, emptyArchivedPlayerSeasonTotals } from './player-season-history.js';

const parse=value=>typeof value==='object'&&value!==null?value:JSON.parse(value||'{}');
const text=value=>String(value??'').trim();

// The archived snapshot, not today's roster or a later failed candidate, owns
// these totals. Include departed players who exist only in its statistics.
export async function planPlayerSeasonFreeze({leagueId,season,snapshotId,players=[],records=[],aliases=[],summaries=[]}){
  const scopedAliases=aliases.filter(row=>(!row.league_id||row.league_id===leagueId)
    &&(!row.source_system||row.source_system===season.source_system)
    &&(!row.source_franchise_id||row.source_franchise_id===season.source_franchise_id));
  const bySource=new Map(scopedAliases.map(row=>[text(row.source_player_id),row.player_identity_id]));
  const candidates=new Map();
  for(const row of records){
    const record=parse(row.data_json??row),id=text(record.player_external_id??record.player_id??record.playerId);
    if(id&&!candidates.has(id))candidates.set(id,{id,name:text(record.player_name)||id,team:null,status:'unknown'});
  }
  for(const row of players){
    const record=parse(row.data_json??row),id=text(row.external_id??record.external_id??record.externalId);
    if(!id)continue;
    const team=text(record.team_external_id??record.teamExternalId)||null;
    candidates.set(id,{id,name:text(record.display_name??record.displayName)||id,
      first:record.first_name??record.firstName??null,last:record.last_name??record.lastName??null,
      team,status:record.is_free_agent===true||record.isFreeAgent===true?'free-agent':team&&team!=='0'?'rostered':'unknown'});
  }
  const identities=[],newAliases=[];
  const frozenByIdentity=new Map(summaries.map(row=>[row.player_identity_id,{...row}]));
  for(const player of candidates.values()){
    let identityId=bySource.get(player.id);
    if(!identityId){
      const digest=await sha256Hex(JSON.stringify([leagueId,season.source_system,season.source_franchise_id,player.id]));
      identityId=`player_${digest}`;
      identities.push({id:identityId,publicId:`plr_${digest.slice(0,32)}`,name:player.name,first:player.first??null,last:player.last??null});
      newAliases.push({source_player_id:player.id,player_identity_id:identityId});
      bySource.set(player.id,identityId);
    }
    if(!frozenByIdentity.has(identityId))frozenByIdentity.set(identityId,{
      player_identity_id:identityId,current_team_external_id:player.team,roster_status:player.status,career_totals_json:'{}'
    });
  }
  const built=buildArchivedPlayerSeasonTotals({records,aliases:[...bySource].map(([source_player_id,player_identity_id])=>({source_player_id,player_identity_id})),
    seasonYear:season.season_year,sourceSnapshotId:snapshotId});
  const empty=emptyArchivedPlayerSeasonTotals({seasonYear:season.season_year,sourceSnapshotId:snapshotId});
  const frozen=[...frozenByIdentity.values()].sort((a,b)=>a.player_identity_id.localeCompare(b.player_identity_id)).map(row=>({...row,
    season_totals_json:JSON.stringify(built.byIdentity.get(row.player_identity_id)||empty)}));
  return{...built,identities,aliases:newAliases,frozen,summaryCount:frozen.length};
}

export function playerSeasonFreezeStatements(db,{leagueId,season,plan}){
  const statements=[];
  const chunks=(rows,make)=>{for(let i=0;i<rows.length;i+=100)statements.push(make(JSON.stringify(rows.slice(i,i+100))));};
  chunks(plan.identities,payload=>db.prepare(`INSERT OR IGNORE INTO player_identities(id,league_id,public_id,display_name,first_name,last_name)
    SELECT json_extract(value,'$.id'),?,json_extract(value,'$.publicId'),json_extract(value,'$.name'),json_extract(value,'$.first'),json_extract(value,'$.last') FROM json_each(?)`).bind(leagueId,payload));
  chunks(plan.aliases,payload=>db.prepare(`INSERT INTO player_source_aliases
    (league_id,source_system,source_franchise_id,source_player_id,player_identity_id,first_seen_season_id,last_seen_season_id)
    SELECT ?,?,?,json_extract(value,'$.source_player_id'),json_extract(value,'$.player_identity_id'),?,? FROM json_each(?) WHERE true
    ON CONFLICT(league_id,source_system,source_franchise_id,source_player_id) DO UPDATE SET
      player_identity_id=CASE WHEN player_source_aliases.player_identity_id=excluded.player_identity_id THEN player_source_aliases.player_identity_id ELSE NULL END`)
    .bind(leagueId,season.source_system,season.source_franchise_id,season.id,season.id,payload));
  // A concurrent, different alias fails the atomic batch rather than attributing
  // history to the wrong person. A retry plans against the winning identity.
  chunks(plan.frozen,payload=>db.prepare(`INSERT INTO player_season_summaries
    (league_id,franchise_season_id,player_identity_id,current_team_external_id,roster_status,career_totals_json,season_totals_json)
    SELECT ?,?,json_extract(value,'$.player_identity_id'),json_extract(value,'$.current_team_external_id'),
      COALESCE(json_extract(value,'$.roster_status'),'unknown'),COALESCE(json_extract(value,'$.career_totals_json'),'{}'),json_extract(value,'$.season_totals_json')
    FROM json_each(?) WHERE true
    ON CONFLICT(league_id,franchise_season_id,player_identity_id) DO UPDATE SET season_totals_json=excluded.season_totals_json`)
    .bind(leagueId,season.id,payload));
  return statements;
}
