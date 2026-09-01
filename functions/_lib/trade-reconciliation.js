import { activeLeagueTeams, resolveTeam } from './league-teams.js';
import { reconciliationOutcome } from './trade-center.js';

const parse = value => {
  try { return JSON.parse(value || 'null') || {}; }
  catch { return {}; }
};

const rows = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];

export async function reconcileTradeRosterOverlays(db, leagueId, snapshotId) {
  const overlays = await rows(db, `SELECT overlay.*,workflow.status AS workflow_status
    FROM trade_roster_overlays overlay
    JOIN trade_workflows workflow ON workflow.id=overlay.trade_id AND workflow.league_id=overlay.league_id
    WHERE overlay.league_id=? AND overlay.internal_status='active' AND overlay.source_snapshot_id<>?
    ORDER BY overlay.trade_id,overlay.player_identity_id`,leagueId,snapshotId);
  if (!overlays.length) return {checked:0,matched:0,reverted:0,differentTeam:0,notifications:0};

  const teams=await activeLeagueTeams(db,leagueId);
  const sourceIds=[...new Set(overlays.map(row=>String(row.source_player_id)).filter(Boolean))];
  const players=new Map();
  for(let index=0;index<sourceIds.length;index+=75){
    const part=sourceIds.slice(index,index+75),marks=part.map(()=>'?').join(',');
    const found=await rows(db,`SELECT external_id,data_json FROM league_snapshot_records
      WHERE league_id=? AND snapshot_id=? AND domain='players' AND external_id IN (${marks})`,leagueId,snapshotId,...part);
    for(const row of found)players.set(String(row.external_id),parse(row.data_json));
  }

  const statements=[];
  const counts={checked:overlays.length,matched:0,reverted:0,differentTeam:0,notifications:0};
  const trades=new Map();
  for(const overlay of overlays){
    const player=players.get(String(overlay.source_player_id))||{};
    const externalTeam=player.team_external_id??player.teamId??player.team_id??null;
    const maddenTeam=resolveTeam(teams,externalTeam)?.teamKey||null;
    const outcome=reconciliationOutcome(overlay.to_team_key,maddenTeam,overlay.from_team_key);
    if(outcome==='matched')counts.matched++;
    else if(outcome==='reverted')counts.reverted++;
    else counts.differentTeam++;
    const internalStatus=outcome==='matched'?'matched':outcome==='reverted'?'reverted':'superseded';
    statements.push(db.prepare(`UPDATE trade_roster_overlays SET internal_status=?,resolved_snapshot_id=?,resolved_at=CURRENT_TIMESTAMP
      WHERE trade_id=? AND player_identity_id=? AND league_id=? AND internal_status='active'`)
      .bind(internalStatus,snapshotId,overlay.trade_id,overlay.player_identity_id,leagueId));
    statements.push(db.prepare(`INSERT OR IGNORE INTO trade_reconciliation_events
      (id,league_id,trade_id,player_identity_id,snapshot_id,outcome,expected_team_key,madden_team_key,evidence_json,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`trade_reconciliation_${crypto.randomUUID()}`,leagueId,overlay.trade_id,
        overlay.player_identity_id,snapshotId,outcome,overlay.to_team_key,maddenTeam,
        JSON.stringify({source:'madden-active-snapshot',sourcePlayerId:overlay.source_player_id,fromTeamKey:overlay.from_team_key,toTeamKey:overlay.to_team_key,maddenTeamKey:maddenTeam})));
    const trade=trades.get(overlay.trade_id)||{outcomes:[],playerIds:[]};
    trade.outcomes.push(outcome);trade.playerIds.push(overlay.source_player_id);trades.set(overlay.trade_id,trade);
  }

  for(const [tradeId,trade] of trades){
    const transaction=await db.prepare(`SELECT id FROM canonical_transactions WHERE league_id=? AND workflow_trade_id=? ORDER BY created_at LIMIT 1`).bind(leagueId,tradeId).first();
    if(transaction){
      const matched=trade.outcomes.every(value=>value==='matched');
      const executionStatus=matched?'observed-roster':'madden-overridden';
      const authority=matched?'snapshot-inferred':'trade-center';
      statements.push(db.prepare(`UPDATE canonical_transactions SET authority=?,execution_status=?,last_snapshot_id=?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND league_id=?`).bind(authority,executionStatus,snapshotId,transaction.id,leagueId));
      statements.push(db.prepare(`INSERT OR IGNORE INTO canonical_transaction_evidence
        (id,league_id,transaction_id,source_type,source_key,snapshot_id,evidence_json,created_at)
        VALUES (?,? ,?,'snapshot-reconciliation',?,?,?,CURRENT_TIMESTAMP)`).bind(`canonical_evidence_${crypto.randomUUID()}`,leagueId,transaction.id,
          `trade-reconciliation:${tradeId}:${snapshotId}`,snapshotId,JSON.stringify({tradeId,snapshotId,outcomes:trade.outcomes,playerIds:trade.playerIds})));
    }
    if(trade.outcomes.some(value=>value!=='matched')){
      statements.push(db.prepare(`UPDATE trade_workflows SET slot_released_at=COALESCE(slot_released_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND league_id=? AND status='approved' AND free_trade=0`).bind(tradeId,leagueId));
      const reviewers=await rows(db,`SELECT user_id FROM league_memberships
        WHERE league_id=? AND active=1 AND role='commissioner'`,leagueId);
      for(const reviewer of reviewers){
        statements.push(db.prepare(`INSERT INTO league_notifications
          (id,league_id,user_id,trade_id,notification_type,title,message,created_at)
          VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(`notification_${crypto.randomUUID()}`,leagueId,reviewer.user_id,tradeId,
            'madden-roster-difference','Madden roster differs from an approved trade',
            'The latest Madden import placed one or more traded players on a different roster. Madden ownership is now displayed.'));
        counts.notifications++;
      }
    }
  }
  for(let index=0;index<statements.length;index+=75)await db.batch(statements.slice(index,index+75));
  return counts;
}
