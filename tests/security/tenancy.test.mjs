import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, readJson, walkFiles } from '../../tools/lib/project.mjs';
import {
  resolveRequestTenant,
  resolveTenant,
  sessionBelongsToTenant,
  tenantFeatureEnabled,
  tenantNamespace
} from '../../functions/_lib/tenant-context.js';
import { activeLeagueTeams, activeTeamAssignments } from '../../functions/_lib/league-teams.js';

async function migrationFiles() {
  return (await walkFiles())
    .filter(file => /^migrations\/\d+_.+\.sql$/.test(file))
    .sort((left, right) => left.localeCompare(right));
}

async function applyFiles(database, files) {
  for (const file of files) database.exec(await readFile(path.join(ROOT, file), 'utf8'));
}

function d1(database) {
  return {
    prepare(sql) {
      let values = [];
      const statement = database.prepare(sql);
      const api = {
        bind(...next) { values = next; return api; },
        async first() { return statement.get(...values) || null; },
        async all() { return { results: statement.all(...values) }; },
        async run() {
          const result = statement.run(...values);
          return { success:true, meta:{ changes:Number(result.changes || 0) } };
        }
      };
      return api;
    }
  };
}

function seedTenant(database, id, slug, name, status = 'enabled') {
  database.prepare(`INSERT INTO leagues (
    id,name,product_name,slug,public_status,tenant_status,timezone
  ) VALUES (?,?,?,?,?,?,?)`).run(id,name,'Franchise HQ',slug,'active',status,'America/Chicago');
}

test('tenant resolution is explicit, alias-aware, feature-backed, and fail-closed', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    await applyFiles(database, await migrationFiles());
    seedTenant(database,'league-a','alpha-league','Alpha League');
    seedTenant(database,'league-b','beta-league','Beta League');
    seedTenant(database,'league-disabled','disabled-league','Disabled League','disabled');
    database.prepare(`INSERT INTO league_slug_aliases (alias_slug,league_id) VALUES (?,?)`).run('alpha','league-a');
    database.prepare(`INSERT INTO league_domains (id,league_id,hostname,is_primary) VALUES (?,?,?,1)`).run('domain-a','league-a','alpha.example.test');
    database.prepare(`INSERT INTO league_features (league_id,feature_key,enabled) VALUES (?,?,1)`).run('league-a','madden_import');
    const env = { DB:d1(database) };

    const alpha = await resolveTenant(env,'alpha-league');
    const alias = await resolveTenant(env,'alpha');
    const beta = await resolveTenant(env,'beta-league');
    assert.equal(alpha.id,'league-a');
    assert.equal(alias.id,'league-a');
    assert.equal(beta.id,'league-b');
    assert.equal(await resolveTenant(env,''),null);
    assert.equal(await resolveTenant(env,'disabled-league'),null);
    assert.equal((await resolveTenant(env,'disabled-league',{requireEnabled:false})).id,'league-disabled');
    assert.equal(tenantFeatureEnabled(alpha,'madden_import'),true);
    assert.equal(tenantFeatureEnabled(alpha,'unknown_feature'),false);
    assert.deepEqual(alpha.domains,[{hostname:'alpha.example.test',primary:true}]);
    assert.notEqual(tenantNamespace(alpha,'companion','latest'),tenantNamespace(beta,'companion','latest'));

    const routeTenant = await resolveRequestTenant({
      env,
      params:{leagueSlug:'beta-league'},
      request:new Request('https://franchisehq.test/api/leagues/beta-league')
    });
    assert.equal(routeTenant.id,'league-b');
    assert.equal(await resolveRequestTenant({env,params:{},request:new Request('https://franchisehq.test/api/auth/me')}),null);
    assert.equal(sessionBelongsToTenant({membership:{active:true,leagueId:'league-a'}},alpha),true);
    assert.equal(sessionBelongsToTenant({membership:{active:true,leagueId:'league-a'}},beta),false);
  } finally {
    database.close();
  }
});

test('identical team identities and assignments remain isolated between tenants', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys = ON;');
    await applyFiles(database, await migrationFiles());
    seedTenant(database,'league-a','alpha-league','Alpha League');
    seedTenant(database,'league-b','beta-league','Beta League');
    for (const [leagueId,snapshotId,teamName,ownerId,discordId] of [
      ['league-a','snapshot-a','Alpha Buccaneers','owner-a','100000000000000001'],
      ['league-b','snapshot-b','Beta Buccaneers','owner-b','100000000000000002']
    ]) {
      database.prepare(`INSERT INTO users (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`)
        .run(ownerId,discordId,ownerId,ownerId);
      database.prepare(`INSERT INTO league_memberships (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`)
        .run(`membership-${ownerId}`,leagueId,ownerId,'team_owner','tb');
      database.prepare(`INSERT INTO league_snapshots (id,league_id,status,team_count,manifest_json) VALUES (?,?,'active',1,'{}')`)
        .run(snapshotId,leagueId);
      database.prepare(`INSERT INTO league_snapshot_records (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,'teams','1',?)`)
        .run(snapshotId,leagueId,JSON.stringify({external_id:'1',abbreviation:'TB',display_name:teamName}));
      database.prepare(`INSERT INTO league_active_snapshots (league_id,snapshot_id) VALUES (?,?)`).run(leagueId,snapshotId);
    }
    const db=d1(database);
    const teamsA=await activeLeagueTeams(db,'league-a');
    const teamsB=await activeLeagueTeams(db,'league-b');
    const assignmentsA=await activeTeamAssignments(db,'league-a',teamsA);
    const assignmentsB=await activeTeamAssignments(db,'league-b',teamsB);
    assert.equal(teamsA.length,1);
    assert.equal(teamsB.length,1);
    assert.equal(teamsA[0].displayName,'Alpha Buccaneers');
    assert.equal(teamsB[0].displayName,'Beta Buccaneers');
    assert.equal(assignmentsA.get('tb').userId,'owner-a');
    assert.equal(assignmentsB.get('tb').userId,'owner-b');
  } finally {
    database.close();
  }
});

test('every league-owned table carries mandatory direct tenant scope', async () => {
  const contract = await readJson('config/tenant-data-contract.json');
  const database = new DatabaseSync(':memory:');
  try {
    await applyFiles(database, await migrationFiles());
    const tables=database.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all().map(row=>row.name);
    const global=new Set(contract.globalTables);
    const missing=[];
    const nullable=[];
    for(const table of tables){
      if(global.has(table))continue;
      const column=database.prepare(`PRAGMA table_info(${table})`).all().find(item=>item.name==='league_id');
      if(!column)missing.push(table);
      else if(Number(column.notnull)!==1)nullable.push(table);
    }
    assert.deepEqual(missing,[]);
    assert.deepEqual(nullable,[]);
  } finally {
    database.close();
  }
});

test('active runtime contains no hard-coded tenant fallback or direct league resolver', async () => {
  const runtimeFiles=(await walkFiles()).filter(file =>
    file==='app.js'
    || /^functions\/.+\.js$/.test(file)
    || /^league-engine\/.+\.js$/.test(file)
    || /^platform\/.+\.js$/.test(file)
  );
  const defaults=[];
  const directResolvers=[];
  for(const file of runtimeFiles){
    const source=await readFile(path.join(ROOT,file),'utf8');
    if(/furiousgamingcommunity|franchise-hq-primary|DEFAULT_LEAGUE|PRIMARY_LEAGUE/i.test(source))defaults.push(file);
    if(file!=='functions/_lib/tenant-context.js' && /FROM\s+leagues[\s\S]{0,180}(?:slug\s*=|replace\s*\(\s*slug)/i.test(source))directResolvers.push(file);
  }
  assert.deepEqual(defaults,[]);
  assert.deepEqual(directResolvers,[]);
});
