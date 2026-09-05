import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { AUTH_CONSTANTS, hashToken } from '../../functions/_lib/auth.js';
import {
  onRequestGet as getCompetition,
  onRequestPost as postCompetition
} from '../../functions/api/leagues/[leagueSlug]/competition.js';

async function applyMigrations(database) {
  const files = (await walkFiles()).filter(file => /^migrations\/\d+_.+\.sql$/.test(file)).sort();
  for (const file of files) database.exec(await readFile(path.join(ROOT,file),'utf8'));
}

function d1(database) {
  return {
    prepare(sql) {
      let values = [];
      const statement = database.prepare(sql);
      const api = {
        bind(...next) { values = next; return api; },
        async first() { return statement.get(...values) || null; },
        async all() { return {results:statement.all(...values)}; },
        async run() {
          const result = statement.run(...values);
          return {success:true,meta:{changes:Number(result.changes || 0)}};
        }
      };
      return api;
    },
    async batch(statements) {
      const results = [];
      database.exec('BEGIN');
      try {
        for (const statement of statements) results.push(await statement.run());
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

async function seedIdentity(database,{id,role,teamId = null,token}) {
  database.prepare(`INSERT INTO users
    (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`)
    .run(id,`discord-${id}`,id,id === 'commissioner' ? 'Commissioner' : 'Team Owner');
  database.prepare(`INSERT INTO league_memberships
    (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`)
    .run(`membership-${id}`,'league-competition',id,role,teamId);
  database.prepare(`INSERT INTO sessions
    (id,user_id,session_token_hash,expires_at,last_seen_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP)`)
    .run(`session-${id}`,id,await hashToken(token),'2099-01-01T00:00:00.000Z');
}

function context(db,token,method = 'GET',body = null) {
  return {
    params:{leagueSlug:'competition-league'},
    env:{DB:db},
    request:new Request('https://franchisehq.app/api/leagues/competition-league/competition',{
      method,
      headers:{
        Cookie:`${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=${token}`,
        ...(body ? {'content-type':'application/json'} : {})
      },
      ...(body ? {body:JSON.stringify(body)} : {})
    })
  };
}

function game(id,homeTeamId,awayTeamId) {
  return JSON.stringify({
    external_id:id,
    season_year:2026,
    stage:'regular',
    week_index:10,
    home_team_external_id:homeTeamId,
    away_team_external_id:awayTeamId,
    status:'scheduled'
  });
}

test('Game of the Week and Confidence Pool are tenant-scoped, shared, and commissioner controlled', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys=ON');
    await applyMigrations(database);
    database.prepare(`INSERT INTO leagues
      (id,name,product_name,slug,current_season,current_week,public_status,tenant_status,timezone)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
        'league-competition','Competition League','FranchiseHQ','competition-league',2026,10,
        'active','enabled','America/Chicago'
      );
    await seedIdentity(database,{id:'commissioner',role:'commissioner',token:'commissioner-token'});
    await seedIdentity(database,{id:'owner',role:'team_owner',teamId:'tb',token:'owner-token'});
    database.prepare(`INSERT INTO league_snapshots
      (id,league_id,status,season_year,week_index,team_count,player_count,game_count,
       statistic_count,standing_count,manifest_json,validation_status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        'snapshot-week-10','league-competition','active',2026,10,32,2042,2,0,32,'{}','ready'
      );
    database.prepare(`INSERT INTO league_active_snapshots
      (league_id,snapshot_id,activated_by) VALUES (?,?,?)`)
      .run('league-competition','snapshot-week-10','commissioner');
    database.prepare(`INSERT INTO league_snapshot_records
      (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`)
      .run('snapshot-week-10','league-competition','games','game-10-a',game('game-10-a','tb','sf'));
    database.prepare(`INSERT INTO league_snapshot_records
      (snapshot_id,league_id,domain,external_id,data_json) VALUES (?,?,?,?,?)`)
      .run('snapshot-week-10','league-competition','games','game-10-b',game('game-10-b','kc','buf'));
    const db = d1(database);

    const initial = await getCompetition(context(db,'owner-token'));
    const initialPayload = await initial.json();
    assert.equal(initial.status,200,JSON.stringify(initialPayload));
    assert.equal(initialPayload.release,'7.4.3');
    assert.equal(initialPayload.games.length,2);

    const forbidden = await postCompetition(context(db,'owner-token','POST',{
      action:'set-gotw',gameId:'game-10-a'
    }));
    assert.equal(forbidden.status,403);

    const gotw = await postCompetition(context(db,'commissioner-token','POST',{
      action:'set-gotw',gameId:'game-10-a'
    }));
    const gotwPayload = await gotw.json();
    assert.equal(gotw.status,200,JSON.stringify(gotwPayload));
    assert.equal(gotwPayload.gotw['regular:10'],'game-10-a');

    const opened = await postCompetition(context(db,'commissioner-token','POST',{
      action:'open-confidence-window',startWeek:10,endWeek:10
    }));
    assert.equal(opened.status,200,JSON.stringify(await opened.clone().json()));

    for (const body of [
      {action:'save-confidence-pick',gameId:'game-10-a',selectedTeamId:'tb',confidenceValue:1},
      {action:'save-confidence-pick',gameId:'game-10-b',selectedTeamId:'kc',confidenceValue:2}
    ]) {
      const saved = await postCompetition(context(db,'owner-token','POST',body));
      const payload = await saved.json();
      assert.equal(saved.status,200,JSON.stringify(payload));
    }
    const submitted = await postCompetition(context(db,'owner-token','POST',{
      action:'submit-confidence-week',weekIndex:10
    }));
    const submittedPayload = await submitted.json();
    assert.equal(submitted.status,200,JSON.stringify(submittedPayload));
    assert.equal(submittedPayload.confidence.entry.status,'submitted');
    assert.equal(submittedPayload.confidence.entry.picks['game-10-a'].confidence,1);
    assert.equal(submittedPayload.confidence.entry.picks['game-10-b'].selectedTeamId,'kc');
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM tenant_audit_events
      WHERE league_id='league-competition'`).get().count,5);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally {
    database.close();
  }
});
