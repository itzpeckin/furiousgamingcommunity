import { canonicalLeagueContext } from './league-context.js';

const rows = async (db, sql, ...values) => (
  await db.prepare(sql).bind(...values).all()
).results || [];

const isoAgeMinutes = value => {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? Math.max(0, Math.round((Date.now() - time) / 60000)) : null;
};

const check = (code, label, status, detail, observedAt = null) => ({
  code,label,status,detail,observedAt,
  tone:status === 'healthy' ? 'success' : status === 'unavailable' ? 'neutral' : 'warning'
});

export async function operationalHealth(db, league) {
  const [active, domainRows, latestImport, stalledImports, installation, latestSync,
    failedDeliverySummary, failedDeliveryRows, destinationAttemptRows, recovery, migration] = await Promise.all([
    db.prepare(`SELECT snapshot.*,active.activated_at AS active_activated_at
      FROM league_active_snapshots active
      JOIN league_snapshots snapshot
        ON snapshot.id=active.snapshot_id AND snapshot.league_id=active.league_id
      WHERE active.league_id=? LIMIT 1`).bind(league.id).first(),
    rows(db, `SELECT record.domain,COUNT(*) AS count
      FROM league_active_snapshots active
      JOIN league_snapshot_records record
        ON record.league_id=active.league_id AND record.snapshot_id=active.snapshot_id
      WHERE active.league_id=? GROUP BY record.domain`, league.id),
    db.prepare(`SELECT id,status,current_phase AS currentPhase,candidate_snapshot_id AS candidateSnapshotId,
        active_snapshot_id_after AS activeSnapshotIdAfter,duration_ms AS durationMs,
        updated_at AS updatedAt,completed_at AS completedAt
      FROM companion_candidate_import_runs WHERE league_id=?
      ORDER BY created_at DESC LIMIT 1`).bind(league.id).first(),
    db.prepare(`SELECT COUNT(*) AS count FROM companion_candidate_import_runs
      WHERE league_id=? AND status IN ('created','running')
        AND updated_at<datetime('now','-15 minutes')`).bind(league.id).first(),
    db.prepare(`SELECT status,updated_at AS updatedAt FROM discord_league_installations
      WHERE league_id=? LIMIT 1`).bind(league.id).first(),
    db.prepare(`SELECT status,season_year AS seasonYear,phase,week_index AS week,
        game_count AS gameCount,thread_count AS threadCount,error_count AS errorCount,
        updated_at AS updatedAt
      FROM discord_schedule_sync_runs WHERE league_id=?
      ORDER BY created_at DESC LIMIT 1`).bind(league.id).first(),
    db.prepare(`SELECT COUNT(*) AS unresolved,
        SUM(CASE WHEN delivery.event_type='trade-message-sync' AND delivery.attempts>=5 AND NOT EXISTS (
          SELECT 1 FROM discord_delivery_events retry
          WHERE retry.league_id=delivery.league_id
            AND json_extract(retry.payload_json,'$.retryOfDeliveryEventId')=delivery.id
            AND retry.status IN ('pending','sending')
        ) THEN 1 ELSE 0 END) AS retryable
      FROM discord_delivery_events delivery WHERE delivery.league_id=? AND delivery.status='failed'`).bind(league.id).first(),
    rows(db, `SELECT id,event_type AS eventType,resource_type AS resourceType,resource_id AS resourceId,
        attempts,last_error AS lastError,updated_at AS updatedAt,
        CASE WHEN event_type='trade-message-sync' AND attempts>=5 AND NOT EXISTS (
          SELECT 1 FROM discord_delivery_events retry
          WHERE retry.league_id=delivery.league_id
            AND json_extract(retry.payload_json,'$.retryOfDeliveryEventId')=delivery.id
            AND retry.status IN ('pending','sending')
        ) THEN 1 ELSE 0 END AS retryable,
        CASE WHEN EXISTS (
          SELECT 1 FROM discord_delivery_events retry
          WHERE retry.league_id=delivery.league_id
            AND json_extract(retry.payload_json,'$.retryOfDeliveryEventId')=delivery.id
            AND retry.status IN ('pending','sending')
        ) THEN 1 ELSE 0 END AS retryPending
      FROM discord_delivery_events delivery
      WHERE league_id=? AND status='failed'
      ORDER BY updated_at DESC,id DESC LIMIT 12`, league.id),
    rows(db, `SELECT attempt.delivery_event_id AS deliveryEventId,attempt.attempt_number AS attemptNumber,
        attempt.destination_kind AS destinationKind,attempt.event_type AS eventType,
        attempt.visibility,attempt.outcome,attempt.message_count AS messageCount,
        attempt.error_code AS errorCode,attempt.error_status AS errorStatus,
        attempt.error_message AS errorMessage,attempt.created_at AS createdAt
      FROM discord_delivery_destination_attempts attempt
      JOIN discord_delivery_events delivery ON delivery.id=attempt.delivery_event_id
        AND delivery.league_id=attempt.league_id
      WHERE attempt.league_id=? AND delivery.status='failed'
      ORDER BY attempt.created_at DESC,attempt.id DESC LIMIT 60`, league.id),
    db.prepare(`SELECT id,release,evidence_type AS evidenceType,status,
        active_snapshot_id AS activeSnapshotId,schema_version AS schemaVersion,
        verified_at AS verifiedAt
      FROM league_recovery_evidence WHERE league_id=?
      ORDER BY verified_at DESC,id DESC LIMIT 1`).bind(league.id).first(),
    db.prepare(`SELECT version,name,applied_at AS appliedAt FROM schema_migrations
      ORDER BY version DESC LIMIT 1`).first()
  ]);

  const context = canonicalLeagueContext(league, active);
  const actual = Object.fromEntries(domainRows.map(row => [String(row.domain), Number(row.count || 0)]));
  const expected = active ? {
    teams:Number(active.team_count || 0),players:Number(active.player_count || 0),
    games:Number(active.game_count || 0),statistics:Number(active.statistic_count || 0),
    standings:Number(active.standing_count || 0)
  } : {};
  const mismatches = Object.keys(expected).filter(domain => Number(actual[domain] || 0) !== expected[domain]);
  const snapshotHealthy = Boolean(active && context.week && !mismatches.length
    && !['failed','invalid'].includes(String(active.validation_status || '').toLowerCase()));
  const importStalled = Number(stalledImports?.count || 0) > 0;
  const importHealthy = !importStalled && (!latestImport || latestImport.status !== 'failed');
  const discordEnabled = installation?.status === 'active';
  const diagnosticsByDelivery = new Map();
  for (const item of destinationAttemptRows) {
    if (!diagnosticsByDelivery.has(item.deliveryEventId)) diagnosticsByDelivery.set(item.deliveryEventId, []);
    if (diagnosticsByDelivery.get(item.deliveryEventId).length < 12) diagnosticsByDelivery.get(item.deliveryEventId).push({
      attemptNumber:Number(item.attemptNumber || 0),destinationKind:item.destinationKind,eventType:item.eventType,
      visibility:item.visibility,outcome:item.outcome,messageCount:Number(item.messageCount || 0),
      errorCode:item.errorCode || null,errorStatus:item.errorStatus == null ? null : Number(item.errorStatus),
      errorMessage:item.errorMessage || null,createdAt:item.createdAt
    });
  }
  const discordFailures = failedDeliveryRows.map(item => ({
    ...item,attempts:Number(item.attempts || 0),retryable:discordEnabled&&Boolean(Number(item.retryable)),
    retryPending:Boolean(Number(item.retryPending)),
    diagnostics:diagnosticsByDelivery.get(item.id) || []
  }));
  const unresolvedFailures = Number(failedDeliverySummary?.unresolved || 0);
  const retryableFailures = Number(failedDeliverySummary?.retryable || 0);
  const availableRetryableFailures = discordEnabled ? retryableFailures : 0;
  const discordHealthy = unresolvedFailures === 0 && (!discordEnabled
    || !['failed','partial'].includes(String(latestSync?.status || '').toLowerCase()));
  const recoveryAge = isoAgeMinutes(recovery?.verifiedAt);
  const recoveryHealthy = recovery?.status === 'verified' && recoveryAge !== null && recoveryAge <= 60 * 24 * 30;

  const checks = [
    check('canonical_snapshot','Canonical league data',snapshotHealthy?'healthy':'attention',
      !active?'No active snapshot is available.':mismatches.length?`Stored counts disagree for: ${mismatches.join(', ')}.`
        :`${context.displayLabel} · ${active.id}`,active?.active_activated_at || active?.activated_at),
    check('import_pipeline','Import pipeline',importHealthy?'healthy':'attention',
      importStalled?`${stalledImports.count} import checkpoint(s) have not progressed for 15 minutes.`
        :latestImport?`${latestImport.status} · ${latestImport.currentPhase}`:'No import run has been recorded.',latestImport?.updatedAt),
    check('discord_delivery','Discord delivery',discordHealthy?'healthy':'attention',
      unresolvedFailures?`${unresolvedFailures} unresolved delivery event(s).${availableRetryableFailures?` ${availableRetryableFailures} need commissioner retry.`:''}${!discordEnabled?' Reconnect Discord before retrying.':''}`
        :!discordEnabled?'Discord is not enabled for this league.'
        :latestSync?`${latestSync.status} · ${latestSync.phase} Week ${latestSync.week}`:'Connected; no schedule sync has run yet.',
      discordFailures[0]?.updatedAt || latestSync?.updatedAt || installation?.updatedAt),
    check('recovery_evidence','Recovery evidence',recoveryHealthy?'healthy':recovery?'attention':'unavailable',
      recovery?`${recovery.release} ${recovery.evidenceType} · ${recovery.status}`:'No release recovery drill has been recorded yet.',recovery?.verifiedAt),
    check('schema','Database schema',Number(migration?.version || 0) >= 45?'healthy':'attention',
      `Migration ${Number(migration?.version || 0)} · ${migration?.name || 'unknown'}`,migration?.appliedAt)
  ];
  const attention = checks.filter(item => item.status === 'attention');
  return {
    status:attention.length?'attention':'healthy',
    checkedAt:new Date().toISOString(),
    context,
    checks,
    alerts:attention.map(item => ({code:item.code,title:item.label,message:item.detail,tone:'warning'})),
    discordFailures,
    discordFailureSummary:{unresolved:unresolvedFailures,retryable:availableRetryableFailures,shown:discordFailures.length},
    latestRecovery:recovery ? {...recovery,bookmarkRetained:Boolean(recovery.id)} : null,
    privacy:{requestBodiesLogged:false,credentialsLogged:false,rawExportsLogged:false}
  };
}
