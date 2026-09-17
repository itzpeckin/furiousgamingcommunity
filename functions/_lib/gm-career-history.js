import { buildGmSeasonSummaries } from './gm-career.js';
import { normalizeLeagueTeam, resolveTeam } from './league-teams.js';

const text=value=>value===null||value===undefined?'':String(value).trim();
const parse=value=>{try{return JSON.parse(value||'null')}catch{return null}};

function sourceRecord(row={}){
  const raw=parse(row.data_json)||{};
  const nested=typeof raw.source_record_json==='string'?parse(raw.source_record_json):(raw.source_record_json||raw.source||null);
  return nested&&typeof nested==='object'?{...nested,...raw}:raw;
}

function value(raw={},keys=[]){
  for(const key of keys)if(raw[key]!==undefined&&raw[key]!==null&&raw[key]!=='')return raw[key];
  return null;
}

function snapshotGame(row,franchiseSeasonId,teams){
  const raw=sourceRecord(row);
  const homeExternal=text(value(raw,['home_team_external_id','homeTeamId','home_team_id','homeId']));
  const awayExternal=text(value(raw,['away_team_external_id','awayTeamId','away_team_id','awayId']));
  return{
    id:row.external_id,
    franchiseSeasonId,
    stage:text(value(raw,['stage','stage_name','stageName','seasonStage'])),
    week:Number(value(raw,['week_index','weekIndex','week']))||0,
    status:text(value(raw,['status','game_status','gameStatus'])),
    homeTeamKey:resolveTeam(teams,homeExternal)?.teamKey||'',
    awayTeamKey:resolveTeam(teams,awayExternal)?.teamKey||'',
    homeScore:Number(value(raw,['home_score','homeScore'])),
    awayScore:Number(value(raw,['away_score','awayScore']))
  };
}

function correctedRow(row,summary){
  if(!summary)return row;
  return{
    ...row,
    teams_json:JSON.stringify(summary.teams||[]),
    regular_wins:Number(summary.regularWins||0),regular_losses:Number(summary.regularLosses||0),regular_ties:Number(summary.regularTies||0),
    playoff_wins:Number(summary.playoffWins||0),playoff_losses:Number(summary.playoffLosses||0),playoff_ties:Number(summary.playoffTies||0),
    playoff_appearance:Number(summary.playoffAppearance||0),conference_championships:Number(summary.conferenceChampionships||0),
    super_bowl_appearances:Number(summary.superBowlAppearances||0),super_bowl_championships:Number(summary.superBowlChampionships||0),
    game_count:Number(summary.gameCount||0),history_rebuilt_from_snapshot:true
  };
}

/**
 * Rebuild frozen GM totals from the immutable source snapshot when it is still
 * available. Stored rows remain untouched and are the safe fallback for older
 * seasons whose source snapshot is no longer retained.
 */
export async function rehydrateFrozenGmSeasonRows(db,{leagueId,teams=[],periods=[],rows=[]}={}){
  const output=[...rows],groups=new Map();
  for(const [index,row] of output.entries()){
    const snapshotId=text(row.source_snapshot_id??row.sourceSnapshotId);
    const franchiseSeasonId=text(row.franchise_season_id??row.franchiseSeasonId);
    if(!snapshotId||!franchiseSeasonId)continue;
    const key=`${snapshotId}\u0000${franchiseSeasonId}`;
    if(!groups.has(key))groups.set(key,{snapshotId,franchiseSeasonId,indexes:[]});
    groups.get(key).indexes.push(index);
  }
  for(const group of groups.values()){
    const result=await db.prepare(`SELECT external_id,domain,data_json FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain IN ('games','teams') ORDER BY domain,external_id`).bind(leagueId,group.snapshotId).all();
    const records=result?.results||[];
    if(!records.length)continue;
    const retainedTeams=records.filter(row=>row.domain==='teams')
      .map(row=>normalizeLeagueTeam(parse(row.data_json)||{},row.external_id)).filter(team=>team.teamKey&&team.externalId);
    const canonicalTeams=retainedTeams.length?retainedTeams:teams;
    const games=records.filter(row=>!row.domain||row.domain==='games')
      .map(row=>snapshotGame(row,group.franchiseSeasonId,canonicalTeams));
    const built=buildGmSeasonSummaries({games,periods,franchiseSeasonId:group.franchiseSeasonId});
    const byIdentity=new Map(built.summaries.map(summary=>[text(summary.gmIdentityId),summary]));
    for(const index of group.indexes){
      const identityId=text(output[index].gm_identity_id??output[index].gmIdentityId);
      output[index]=correctedRow(output[index],byIdentity.get(identityId));
    }
  }
  return output;
}
