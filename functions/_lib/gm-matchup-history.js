import { buildGmSeasonSummaries, canonicalOwnershipStage } from './gm-career.js';
import { snapshotGame, sourceRecord } from './gm-career-history.js';
import { normalizeLeagueTeam, resolveTeam } from './league-teams.js';

const text=value=>value==null?'':String(value).trim();
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{}}catch{return {}}};
const number=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);

function turnovers(raw) {
  const metrics={...raw,...parse(raw.metrics_json)};
  const sum=(a,b)=>number(metrics[a])===null||number(metrics[b])===null?null:number(metrics[a])+number(metrics[b]);
  return {giveaways:sum('offIntsLost','offFumLost'),takeaways:sum('defIntsRec','defFumRec')};
}

/** Only game-level team totals count. Player totals and cumulative standings
 * would double-count turnovers. Ambiguous/missing records remain unavailable. */
export function buildSeasonGameHistory({records=[],teams=[],periods=[],franchiseSeasonId,seasonYear,label}={}) {
  const retainedTeams=records.filter(row=>row.domain==='teams').map(row=>normalizeLeagueTeam(parse(row.data_json),row.external_id));
  const seasonTeams=retainedTeams.length?retainedTeams:teams;
  const games=records.filter(row=>row.domain==='games').map(row=>snapshotGame(row,franchiseSeasonId,seasonTeams));
  const stats=records.filter(row=>row.domain==='statistics').map(row=>{
    const raw=sourceRecord(row),metrics=parse(raw.metrics_json);
    return {raw,teamKey:resolveTeam(seasonTeams,raw.team_external_id??raw.teamId)?.teamKey,
      gameId:text(metrics.__gameId??metrics.scheduleId??raw.scheduleId??raw.gameId),
      stage:canonicalOwnershipStage(raw.stage,raw.week_index),week:Number(raw.week_index),values:turnovers(raw)};
  }).filter(row=>row.raw.category==='team-game');
  for(const game of games)for(const side of ['home','away']){
    const matches=stats.filter(row=>row.teamKey===game[`${side}TeamKey`] && (row.gameId
      ? row.gameId===text(game.id)
      : row.stage===canonicalOwnershipStage(game.stage,game.week)&&row.week===game.week&&games.filter(other=>canonicalOwnershipStage(other.stage,other.week)===row.stage&&other.week===row.week&&[other.homeTeamKey,other.awayTeamKey].includes(row.teamKey)).length===1));
    // Repeated identical captures are harmless; conflicting captures cannot be
    // silently added or arbitrarily selected.
    const distinct=[...new Set(matches.map(row=>JSON.stringify(row.values)))];
    game[`${side}Turnovers`]=distinct.length===1?JSON.parse(distinct[0]):null;
  }
  const built=buildGmSeasonSummaries({games,periods,franchiseSeasonId});
  const attributed=new Map();
  for(const row of built.attributedGames){
    if(!attributed.has(row.gameId))attributed.set(row.gameId,{});
    attributed.get(row.gameId)[row.side]=row;
  }
  const history=games.filter(game=>attributed.has(text(game.id))).map(game=>{
    const attribution=attributed.get(text(game.id));
    const scoreKnown=Object.values(attribution).some(row=>row.resultProof==='completed-score');
    const side=value=>({gmIdentityId:attribution[value]?.gmIdentityId||null,
      teamKey:game[`${value}TeamKey`],teamName:resolveTeam(seasonTeams,game[`${value}TeamKey`])?.displayName||game[`${value}TeamKey`].toUpperCase(),
      score:scoreKnown?game[`${value}Score`]:null,result:attribution[value]?.result||null});
    return {id:`${franchiseSeasonId}:${game.id}`,franchiseSeasonId,seasonYear,label,week:game.week,
      stage:canonicalOwnershipStage(game.stage,game.week),resultProof:scoreKnown?'completed-score':'bracket-advancement',
      home:side('home'),away:side('away')};
  });
  return {...built,games:history,hasGames:games.length>0};
}

/** Read one authoritative snapshot per season, never every import. No writes,
 * no reassignment to today's GM, and every lookup is scoped to the league. */
export async function loadLeagueGameHistory(db,{leagueId,contextState,teams=[],periods=[],historyRows=[],activeSeason}={}) {
  const groups=new Map();
  for(const row of historyRows){
    const id=row.franchise_season_id;
    if(!groups.has(id))groups.set(id,{franchiseSeasonId:id,seasonYear:Number(row.season_year),label:row.display_name,snapshotId:row.source_snapshot_id,rows:[]});
    groups.get(id).rows.push(row);
  }
  const closures=await db.prepare(`SELECT franchise_season_id,postseason_summary_json FROM franchise_season_closures WHERE league_id=?`).bind(leagueId).all();
  for(const row of closures?.results||[]){
    const group=groups.get(row.franchise_season_id),source=parse(row.postseason_summary_json).sourceSnapshotId;
    if(group&&source)group.snapshotId=source;
  }
  if(contextState.franchiseSeasonId)groups.set(contextState.franchiseSeasonId,{
    franchiseSeasonId:contextState.franchiseSeasonId,seasonYear:Number(activeSeason?.season_year)||contextState.seasonYear,
    label:activeSeason?.display_name||String(contextState.seasonYear),snapshotId:contextState.snapshotId,rows:[],live:true
  });
  const seasons=[],games=[];
  for(const group of groups.values()){
    const result=group.snapshotId?await db.prepare(`SELECT external_id,domain,data_json FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND (domain IN ('games','teams')
        OR (domain='statistics' AND json_extract(data_json,'$.category')='team-game')) ORDER BY domain,external_id`)
      .bind(leagueId,group.snapshotId).all():null;
    const built=buildSeasonGameHistory({...group,records:result?.results||[],teams,periods});
    seasons.push({...group,built});games.push(...built.games);
  }
  games.sort((a,b)=>b.seasonYear-a.seasonYear||b.week-a.week||a.id.localeCompare(b.id));
  return {seasons,games};
}
