import { scheduleAdvanceDecision, snapshotCurrentPeriod } from './schedule-integrity.js';

// Recheck the recorded transition against the exact tenant-scoped prior snapshot.
// A different week alone is not permission to retire threads or skip recaps.
export async function automaticScheduleDecision(db,leagueId,active){
  let manifest={};
  try{manifest=JSON.parse(active.manifest_json||'{}')}catch{}
  const recorded=manifest.discordScheduleTransition;
  const previousId=recorded?.sourceSnapshotId;
  const previous=previousId?await db.prepare(`SELECT id,season_year,week_index,manifest_json
    FROM league_snapshots WHERE id=? AND league_id=? LIMIT 1`).bind(previousId,leagueId).first():null;
  const decision=scheduleAdvanceDecision(previous,{period:snapshotCurrentPeriod(active),
    proof:manifest.currentPeriodProof,seasonYear:active.seasonYear??active.season_year});
  if(!recorded||recorded.allowed!==decision.allowed
    ||recorded.to?.key!==decision.to?.key||recorded.from?.key!==decision.from?.key){
    return{...decision,allowed:false,reviewRequired:true,reason:'transition-proof-unavailable'};
  }
  return decision;
}
