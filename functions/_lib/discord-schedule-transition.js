import { canonicalSchedulePeriod, scheduleAdvanceDecision, snapshotCurrentPeriod } from './schedule-integrity.js';

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
  // Retained manifests can contain the old rule's skipped-period denial when
  // the last preseason export was Week 1 or 2. Recheck the exact source and
  // destination before accepting that corrected opening; do not rewrite proof.
  const correctedOpening=recorded?.allowed===false&&recorded.reason==='skipped-period'
    &&decision.allowed&&decision.reason==='preseason-to-regular-opening'
    &&canonicalSchedulePeriod(manifest.currentPeriodProof?.period)?.key===decision.to?.key
    &&recorded.from?.stage===decision.from?.stage&&recorded.from?.week===decision.from?.week
    &&recorded.to?.stage===decision.to?.stage&&recorded.to?.week===decision.to?.week;
  if(!recorded||(recorded.allowed!==decision.allowed&&!correctedOpening)
    ||recorded.to?.key!==decision.to?.key||recorded.from?.key!==decision.from?.key){
    return{...decision,allowed:false,reviewRequired:true,reason:'transition-proof-unavailable'};
  }
  return decision;
}
