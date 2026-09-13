INSERT OR IGNORE INTO draft_pick_ledger_events
  (id,league_id,draft_pick_id,event_type,from_team_key,to_team_key,trade_id,detail_json,created_by_user_id)
SELECT 'pick_correction_20260913_tb_2027_round1',pick.league_id,pick.id,'commissioner-correction','ne','tb',NULL,
  '{"reason":"Return Tampa Bay 2027 first-round pick after Trade Center testing","requestedBy":"Peckin","execution":"explicit-owner-request","expectedRevision":2,"newRevision":3}',
  'user_f7785a5e-e399-4261-8b41-d6f4f60af8eb'
FROM league_draft_picks pick
WHERE pick.id='pick:franchise-hq-primary:season_0edd7760-1fe3-4756-9b0a-fa0d9cb58d33:2027:1:tb'
  AND pick.league_id='franchise-hq-primary' AND pick.draft_class=2027 AND pick.round=1
  AND pick.original_team_key='tb' AND pick.current_team_key='ne' AND pick.revision=2
  AND EXISTS (SELECT 1 FROM league_memberships WHERE league_id=pick.league_id
    AND user_id='user_f7785a5e-e399-4261-8b41-d6f4f60af8eb' AND active=1 AND role='commissioner');

UPDATE league_draft_picks SET current_team_key='tb',revision=3,updated_at=CURRENT_TIMESTAMP
WHERE id='pick:franchise-hq-primary:season_0edd7760-1fe3-4756-9b0a-fa0d9cb58d33:2027:1:tb'
  AND league_id='franchise-hq-primary' AND draft_class=2027 AND round=1
  AND original_team_key='tb' AND current_team_key='ne' AND revision=2
  AND EXISTS (SELECT 1 FROM draft_pick_ledger_events WHERE id='pick_correction_20260913_tb_2027_round1'
    AND league_id='franchise-hq-primary' AND draft_pick_id=league_draft_picks.id
    AND event_type='commissioner-correction' AND from_team_key='ne' AND to_team_key='tb');

INSERT OR IGNORE INTO tenant_audit_events
  (id,league_id,actor_user_id,request_id,action_id,action,resource_type,resource_id,outcome,detail_json)
SELECT 'audit_pick_correction_20260913_tb_2027_round1',pick.league_id,
  'user_f7785a5e-e399-4261-8b41-d6f4f60af8eb','owner-request-20260913-tb-2027-round1',
  'pick_correction_20260913_tb_2027_round1','draft_pick_commissioner_corrected','league_draft_pick',pick.id,'success',
  '{"asset":"Tampa Bay Buccaneers 2027 Round 1","fromTeamKey":"ne","toTeamKey":"tb","previousRevision":2,"revision":3,"reason":"Return pick after Trade Center testing","onlyOnePickChanged":true,"rostersChanged":false,"tradeHistoryChanged":false,"activeSnapshotChanged":false}'
FROM league_draft_picks pick
WHERE pick.id='pick:franchise-hq-primary:season_0edd7760-1fe3-4756-9b0a-fa0d9cb58d33:2027:1:tb'
  AND pick.league_id='franchise-hq-primary' AND pick.current_team_key='tb' AND pick.revision=3
  AND EXISTS (SELECT 1 FROM draft_pick_ledger_events WHERE id='pick_correction_20260913_tb_2027_round1'
    AND league_id=pick.league_id AND draft_pick_id=pick.id);
