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
    failedDeliveries, recovery, migration] = await Promise.all([
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
    db.prepare(`SELECT COUNT(*) AS count FROM discord_delivery_events
      WHERE league_id=? AND status='failed' AND updated_at>=datetime('now','-1 day')`).bind(league.id).first(),
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
  const discordHealthy = !discordEnabled || (
    Number(failedDeliveries?.count || 0) === 0
    && !['failed','partial'].includes(String(latestSync?.status || '').toLowerCase())
  );
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
      !discordEnabled?'Discord is not enabled for this league.'
        :Number(failedDeliveries?.count || 0)>0?`${failedDeliveries.count} delivery event(s) failed in the last 24 hours.`
        :latestSync?`${latestSync.status} · ${latestSync.phase} Week ${latestSync.week}`:'Connected; no schedule sync has run yet.',latestSync?.updatedAt || installation?.updatedAt),
    check('recovery_evidence','Recovery evidence',recoveryHealthy?'healthy':recovery?'attention':'unavailable',
      recovery?`${recovery.release} ${recovery.evidenceType} · ${recovery.status}`:'No release recovery drill has been recorded yet.',recovery?.verifiedAt),
    check('schema','Database schema',Number(migration?.version || 0) >= 44?'healthy':'attention',
      `Migration ${Number(migration?.version || 0)} · ${migration?.name || 'unknown'}`,migration?.appliedAt)
  ];
  const attention = checks.filter(item => item.status === 'attention');
  return {
    status:attention.length?'attention':'healthy',
    checkedAt:new Date().toISOString(),
    context,
    checks,
    alerts:attention.map(item => ({code:item.code,title:item.label,message:item.detail,tone:'warning'})),
    latestRecovery:recovery ? {...recovery,bookmarkRetained:Boolean(recovery.id)} : null,
    privacy:{requestBodiesLogged:false,credentialsLogged:false,rawExportsLogged:false}
  };
}
