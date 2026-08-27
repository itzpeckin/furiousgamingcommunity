import { json, database, normalizeLeagueSlug, validLeagueSlug, resolveLeague } from '../../../_lib/cloud-platform.js';
import { requireActiveMembership } from '../../../_lib/permissions.js';
const RELEASE='7.0.4';

async function activeSnapshot(db,leagueId){
  return db.prepare(`SELECT s.id,s.status,s.season_year,s.week_index,s.activated_at,s.team_count,s.player_count,s.game_count,s.statistic_count,s.standing_count
    FROM league_active_snapshots a JOIN league_snapshots s ON s.id=a.snapshot_id
    WHERE a.league_id=? LIMIT 1`).bind(leagueId).first();
}

export async function onRequestGet(context){
  const slug=normalizeLeagueSlug(context);
  if(!validLeagueSlug(slug))return json({ok:false,release:RELEASE,error:'Invalid league slug.'},400);
  const authorization=await requireActiveMembership(context);
  if(!authorization.authorized)return authorization.response;
  const db=database(context.env);
  if(!db)return json({ok:false,release:RELEASE,error:'Database binding is missing.'},503);
  const league=await resolveLeague(context.env,slug);
  if(!league||authorization.session.membership?.leagueId!==league.id)return json({ok:false,release:RELEASE,error:'Not found.'},404);
  const snapshot=await activeSnapshot(db,league.id);
  const counts=snapshot?{teams:Number(snapshot.team_count||0),players:Number(snapshot.player_count||0),games:Number(snapshot.game_count||0),statistics:Number(snapshot.statistic_count||0),standings:Number(snapshot.standing_count||0)}:{teams:0,players:0,games:0,statistics:0,standings:0};
  return json({ok:true,release:RELEASE,tenant:{
    id:league.id,slug:league.slug,name:league.name,status:league.public_status,discordConnected:Boolean(league.discord_connected),
    canonicalPath:`/leagues/${league.slug}`,dataState:snapshot?'live':'empty',counts,activeSnapshot:snapshot?{id:snapshot.id,status:snapshot.status,seasonYear:snapshot.season_year,weekIndex:snapshot.week_index,activatedAt:snapshot.activated_at}:null
  },isolation:{leagueId:league.id,emptyByDefault:!snapshot,sharedSnapshot:false,sharedPlayerPool:false,sharedTransactionState:false}});
}
