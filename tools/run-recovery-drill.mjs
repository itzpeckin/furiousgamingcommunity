import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  CloudflareD1ReleaseClient,
  assertExactTarget,
  collectRemoteState,
  targetConfirmation
} from './lib/d1-release.mjs';
import { readJson, stableJson } from './lib/project.mjs';

const DOMAINS = Object.freeze(['teams','players','games','statistics','standings']);

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const literal = value => value === null || value === undefined
  ? 'NULL'
  : `'${String(value).replaceAll("'", "''")}'`;

export function reconcileSnapshotCounts(expected = {}, actual = {}) {
  const mismatches = DOMAINS.flatMap(domain => {
    const expectedCount = Number(expected[domain] || 0);
    const actualCount = Number(actual[domain] || 0);
    return expectedCount === actualCount ? [] : [{domain,expected:expectedCount,actual:actualCount}];
  });
  return {verified:mismatches.length === 0,mismatches};
}

export function recoveryEvidenceInsert(evidence) {
  return `INSERT INTO league_recovery_evidence
    (id,league_id,release,environment,evidence_type,status,database_bookmark,
     schema_version,active_snapshot_id,protected_counts_json,reconciliation_json,
     request_id,action_id,verified_at)
    VALUES (${[
      evidence.id,evidence.leagueId,evidence.release,evidence.environment,
      evidence.evidenceType,evidence.status,evidence.databaseBookmark,
      evidence.schemaVersion,evidence.activeSnapshotId,
      JSON.stringify(evidence.protectedCounts),JSON.stringify(evidence.reconciliation),
      evidence.requestId,evidence.actionId,evidence.verifiedAt
    ].map(literal).join(',')});`;
}

async function run() {
  const targetName = option('--target');
  const record = process.argv.includes('--record');
  if (!targetName) throw new Error('Use --target staging or --target production.');
  const registry = await readJson('config/d1-database-targets.json');
  const target = registry.targets?.[targetName];
  if (!target) throw new Error(`Unknown D1 target: ${targetName}.`);
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN is required and must never be committed.');
  const client = new CloudflareD1ReleaseClient({
    accountId:registry.accountId,databaseId:target.databaseId,apiToken
  });
  const metadata = await client.databaseMetadata();
  assertExactTarget({
    requestedTarget:targetName,target,metadata,apply:record,confirmation:option('--confirm-target')
  });
  const packageJson = await readJson('package.json');
  const remote = await collectRemoteState(client);
  const bookmark = await client.bookmark();
  const activeRows = await client.rows(`SELECT league.id AS leagueId,league.slug,
      snapshot.id AS snapshotId,snapshot.team_count AS teams,snapshot.player_count AS players,
      snapshot.game_count AS games,snapshot.statistic_count AS statistics,
      snapshot.standing_count AS standings
    FROM leagues league
    LEFT JOIN league_active_snapshots active ON active.league_id=league.id
    LEFT JOIN league_snapshots snapshot
      ON snapshot.id=active.snapshot_id AND snapshot.league_id=league.id
    WHERE league.tenant_status='enabled' AND league.public_status='active'
    ORDER BY league.id;`);
  const verifiedAt = new Date().toISOString();
  const evidence = [];
  for (const league of activeRows) {
    const domainRows = league.snapshotId ? await client.rows(`SELECT domain,COUNT(*) AS count
      FROM league_snapshot_records
      WHERE league_id=${literal(league.leagueId)} AND snapshot_id=${literal(league.snapshotId)}
      GROUP BY domain ORDER BY domain;`) : [];
    const expected = Object.fromEntries(DOMAINS.map(domain => [domain,Number(league[domain] || 0)]));
    const actual = Object.fromEntries(domainRows.map(row => [String(row.domain),Number(row.count || 0)]));
    const reconciliation = reconcileSnapshotCounts(expected, actual);
    const status = league.snapshotId && reconciliation.verified && remote.foreignKeyRows.length === 0
      ? 'verified' : 'failed';
    const item = {
      id:`recovery_${randomUUID()}`,
      leagueId:String(league.leagueId),
      release:String(packageJson.version),
      environment:targetName,
      evidenceType:'reconciliation',
      status,
      databaseBookmark:bookmark,
      schemaVersion:Math.max(0,...remote.ledgerRows.map(row => Number(row.version))),
      activeSnapshotId:league.snapshotId || null,
      protectedCounts:remote.protectedCounts,
      reconciliation:{expected,actual,...reconciliation,foreignKeyViolations:remote.foreignKeyRows.length},
      requestId:`req_${randomUUID()}`,
      actionId:`act_${randomUUID()}`,
      verifiedAt
    };
    evidence.push(item);
    if (record) await client.query(recoveryEvidenceInsert(item));
  }
  if (evidence.some(item => item.status !== 'verified')) {
    throw new Error(`Recovery reconciliation failed for ${evidence.filter(item => item.status !== 'verified').length} enabled tenant(s).`);
  }
  console.log(stableJson({
    ok:true,mode:record?'record':'read-only',target:targetName,databaseName:target.databaseName,
    databaseId:target.databaseId,bookmark,release:packageJson.version,
    schemaVersion:evidence[0]?.schemaVersion || 0,foreignKeyViolations:remote.foreignKeyRows.length,
    tenantEvidence:evidence.map(item => ({
      id:item.id,leagueId:item.leagueId,status:item.status,activeSnapshotId:item.activeSnapshotId,
      reconciliation:item.reconciliation,verifiedAt:item.verifiedAt
    }))
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().catch(error => {
    console.error(`Recovery drill failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
