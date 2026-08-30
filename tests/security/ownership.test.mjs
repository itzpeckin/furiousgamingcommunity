import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

import {
  activeTeamAssignments,
  canonicalTeamKey,
  normalizeLeagueTeam,
  publicLeagueTeams,
  resolveTeam
} from '../../functions/_lib/league-teams.js';
import { hashToken } from '../../functions/_lib/auth.js';
import { onRequestPost as retiredLeagueReset } from '../../functions/api/leagues/[leagueSlug]/reset-data.js';
import { normalizeTeam } from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';

function d1(database) {
  const statement = (sql, values = []) => ({
    sql,
    values,
    bind(...next) { return statement(sql, next); },
    async first() { return database.prepare(sql).get(...values) || null; },
    async all() { return { results:database.prepare(sql).all(...values) }; },
    async run() {
      const result = database.prepare(sql).run(...values);
      return { meta:{ changes:Number(result.changes || 0) } };
    }
  });
  return {
    prepare:sql => statement(sql),
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const item of statements) results.push(await item.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

test('Madden team identity is canonical while imported owner labels are ignored', () => {
  const imported = {
    external_id:'ea-team-31',
    display_name:'Tampa Bay Buccaneers',
    abbreviation:'TB',
    nickname:'Buccaneers',
    owner_name:'Legacy Owner',
    source_record_json:JSON.stringify({ userName:'Older Owner', primaryColor:'#111111' })
  };
  const canonical = normalizeLeagueTeam(imported);
  const publicTeam = normalizeTeam(imported);

  assert.equal(canonical.teamKey, 'tb');
  assert.equal(canonical.externalId, 'ea-team-31');
  assert.equal(publicTeam.owner, 'Unassigned');
  assert.equal(publicTeam.source.ownerName, null);
  assert.equal(publicTeam.source.userName, null);
  assert.equal(Object.hasOwn(canonical, 'ownerName'), false);
});

test('canonical teams resolve stable assignments across Madden identifiers and legacy names', async () => {
  const teams = [normalizeLeagueTeam({
    external_id:'ea-team-31',
    abbreviation:'TB',
    display_name:'Tampa Bay Buccaneers',
    nickname:'Buccaneers'
  })];
  assert.equal(canonicalTeamKey(' Tampa Bay Buccaneers '), 'tampa-bay-buccaneers');
  assert.equal(resolveTeam(teams, 'EA-TEAM-31')?.teamKey, 'tb');
  assert.equal(resolveTeam(teams, 'Tampa Bay Buccaneers')?.teamKey, 'tb');
  assert.equal(resolveTeam(teams, 'Buccaneers')?.teamKey, 'tb');

  const db = {
    prepare(sql) {
      assert.match(sql, /FROM league_memberships/);
      return {
        bind(value) { assert.equal(value, 'league-1'); return this; },
        async all() {
          return { results:[{
            membershipId:'membership-1', userId:'user-1', role:'commissioner',
            storedTeamId:'Tampa Bay Buccaneers', displayName:'Peckin'
          }] };
        }
      };
    }
  };
  const assignments = await activeTeamAssignments(db, 'league-1', teams);
  assert.equal(assignments.get('tb')?.displayName, 'Peckin');
  assert.deepEqual(publicLeagueTeams(teams, assignments).map(team => ({
    teamKey:team.teamKey, ownerName:team.ownerName, ownerRole:team.ownerRole
  })), [{ teamKey:'tb', ownerName:'Peckin', ownerRole:'commissioner' }]);
});

test('the database prevents two active memberships from owning the same canonical team key', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT);
    CREATE TABLE league_memberships (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      team_id TEXT,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);
  const migration = await readFile(new URL('../../migrations/legacy/0016_canonical_team_ownership.sql', import.meta.url), 'utf8');
  database.exec(migration);
  const insert = database.prepare(`INSERT INTO league_memberships (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,?)`);
  insert.run('membership-1','league-1','user-1','commissioner','tb',1);
  assert.throws(
    () => insert.run('membership-2','league-1','user-2','team_owner','TB',1),
    /UNIQUE constraint failed/i
  );
  insert.run('membership-3','league-1','user-3','team_owner','TB',0);
  database.close();
});

test('the legacy broad reset is retired without changing Madden data or memberships', async () => {
  const database = new DatabaseSync(':memory:');
  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY, discord_user_id TEXT, discord_username TEXT,
      discord_global_name TEXT, display_name TEXT, avatar_url TEXT
    );
    CREATE TABLE leagues (
      id TEXT PRIMARY KEY, name TEXT, product_name TEXT DEFAULT 'Franchise HQ', slug TEXT,
      current_season INTEGER, current_week INTEGER, trade_start_week INTEGER,
      trade_deadline_week INTEGER, discord_guild_id TEXT, discord_connected INTEGER DEFAULT 0,
      public_status TEXT, tenant_status TEXT DEFAULT 'disabled', timezone TEXT DEFAULT 'UTC',
      branding_json TEXT DEFAULT '{}', configuration_json TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE league_slug_aliases (alias_slug TEXT PRIMARY KEY, league_id TEXT NOT NULL);
    CREATE TABLE league_domains (
      id TEXT PRIMARY KEY, league_id TEXT NOT NULL, hostname TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1
    );
    CREATE TABLE league_features (
      league_id TEXT NOT NULL, feature_key TEXT NOT NULL, enabled INTEGER DEFAULT 0,
      configuration_json TEXT DEFAULT '{}', PRIMARY KEY (league_id, feature_key)
    );
    CREATE TABLE league_memberships (
      id TEXT PRIMARY KEY, league_id TEXT, user_id TEXT, role TEXT, team_id TEXT,
      active INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, user_id TEXT, session_token_hash TEXT, expires_at TEXT,
      revoked_at TEXT, last_seen_at TEXT
    );
    CREATE TABLE league_snapshots (
      id TEXT PRIMARY KEY, league_id TEXT NOT NULL,
      FOREIGN KEY (league_id) REFERENCES leagues(id)
    );
    CREATE TABLE league_snapshot_records (
      snapshot_id TEXT, league_id TEXT NOT NULL, domain TEXT, external_id TEXT, data_json TEXT,
      FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id)
    );
    CREATE TABLE league_active_snapshots (
      league_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL,
      FOREIGN KEY (snapshot_id) REFERENCES league_snapshots(id) ON DELETE RESTRICT
    );
    CREATE TABLE league_data_reset_audit (
      id TEXT PRIMARY KEY, league_id TEXT NOT NULL, actor_user_id TEXT NOT NULL,
      preserved_user_ids_json TEXT NOT NULL, deleted_counts_json TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE tenant_audit_events (
      id TEXT PRIMARY KEY, league_id TEXT NOT NULL, actor_user_id TEXT,
      request_id TEXT NOT NULL, action_id TEXT NOT NULL, action TEXT NOT NULL,
      resource_type TEXT, resource_id TEXT, outcome TEXT NOT NULL,
      detail_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const insertUser = database.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)');
  insertUser.run('justin','1001','peckin','Peckin','Peckin',null);
  insertUser.run('gas','1002','gas','Gas','Gas',null);
  insertUser.run('saluki','1003','saluki','Saluki','Saluki',null);
  database.prepare(`INSERT INTO leagues
    (id,name,product_name,slug,public_status,tenant_status,timezone)
    VALUES (?,?,?,?,?,?,?)`).run(
      'league-1','FGC','Franchise HQ','fgc','active','enabled','America/Chicago'
    );
  const insertMembership = database.prepare('INSERT INTO league_memberships (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,?)');
  insertMembership.run('m-justin','league-1','justin','commissioner','tb',1);
  insertMembership.run('m-gas','league-1','gas','team_owner','gb',1);
  insertMembership.run('m-saluki','league-1','saluki','team_owner','chi',1);
  const token = 'reset-test-session';
  database.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?)').run(
    'session-1','justin',await hashToken(token),'2099-01-01T00:00:00.000Z',null,null
  );
  database.prepare('INSERT INTO league_snapshots VALUES (?,?)').run('snapshot-1','league-1');
  database.prepare('INSERT INTO league_snapshot_records VALUES (?,?,?,?,?)').run('snapshot-1','league-1','teams','tb','{}');
  database.prepare('INSERT INTO league_active_snapshots VALUES (?,?)').run('league-1','snapshot-1');

  const response = await retiredLeagueReset({
    request:new Request('https://franchisehq.app/api/leagues/fgc/reset-data', {
      method:'POST',
      headers:{ 'content-type':'application/json', cookie:`franchise_hq_session=${token}` },
      body:JSON.stringify({ confirmation:'fgc', preserveUserIds:['gas'] })
    }),
    params:{ leagueSlug:'fgc' },
    env:{ DB:d1(database) }
  });
  assert.equal(response.status, 410);
  const payload = await response.json();
  assert.equal(payload.code, 'LEGACY_RESET_RETIRED');
  assert.equal(payload.resetPerformed, false);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM league_snapshots').get().count, 1);
  assert.equal(database.prepare('SELECT active FROM league_memberships WHERE user_id=?').get('justin').active, 1);
  assert.equal(database.prepare('SELECT active FROM league_memberships WHERE user_id=?').get('gas').active, 1);
  assert.equal(database.prepare('SELECT active FROM league_memberships WHERE user_id=?').get('saluki').active, 1);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM league_data_reset_audit').get().count, 0);
  database.close();
});

test('ownership and reset source guards keep authority on the server', async () => {
  const [appSource, tradeSource, resetSource,transitionSource] = await Promise.all([
    readFile(new URL('../../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../../trade-module.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/reset-data.js', import.meta.url), 'utf8'),
    readFile(new URL('../../functions/api/leagues/[leagueSlug]/game-year-transition.js', import.meta.url), 'utf8')
  ]);
  assert.doesNotMatch(appSource, /source\?\.ownerName|source\?\.userName|source\.ownerName|source\.userName/);
  assert.match(tradeSource, /function reviewerRoleForAccount\(account\).*account\.role==='commissioner'/);
  assert.doesNotMatch(tradeSource, /function reviewerRoleForAccount\(account\).*ownershipState/);
  assert.match(resetSource, /requireCommissioner\(context\)/);
  assert.match(resetSource, /LEGACY_RESET_RETIRED/);
  assert.doesNotMatch(resetSource, /DELETE FROM|UPDATE league_memberships/);
  assert.match(transitionSource, /transitionConfirmations/);
  assert.match(transitionSource, /platformPlanePreserved:true/);
});
