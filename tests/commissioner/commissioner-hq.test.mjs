import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { AUTH_CONSTANTS, hashToken } from '../../functions/_lib/auth.js';
import {
  normalizeRulesDocument,
  onRequestGet as getRules,
  onRequestPut as putRules
} from '../../functions/api/leagues/[leagueSlug]/rules.js';
import {
  onRequestGet as getCommissionerHq,
  onRequestPost as postCommissionerHq
} from '../../functions/api/leagues/[leagueSlug]/commissioner-hq.js';

async function migrationFiles() {
  return (await walkFiles()).filter(file => /^migrations\/\d+_.+\.sql$/.test(file)).sort();
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
        async all() { return { results:statement.all(...values) }; },
        async run() {
          const result = statement.run(...values);
          return { success:true, meta:{ changes:Number(result.changes || 0) } };
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

function seedLeague(database) {
  database.prepare(`INSERT INTO leagues
    (id,name,product_name,slug,current_season,current_week,public_status,tenant_status,timezone)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(
      'league-command','Command League','FranchiseHQ','command-league',2026,10,
      'active','enabled','America/Chicago'
    );
}

async function seedIdentity(database, {id, role, teamId = null, token}) {
  database.prepare(`INSERT INTO users
    (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`)
    .run(id,`discord-${id}`,id,id === 'commissioner' ? 'Commissioner' : 'Team Owner');
  database.prepare(`INSERT INTO league_memberships
    (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`)
    .run(`membership-${id}`,'league-command',id,role,teamId);
  database.prepare(`INSERT INTO sessions
    (id,user_id,session_token_hash,expires_at) VALUES (?,?,?,?)`)
    .run(`session-${id}`,id,await hashToken(token),'2099-01-01T00:00:00.000Z');
}

function requestContext(db, token, endpoint, method = 'GET', body = null) {
  return {
    params:{leagueSlug:'command-league'},
    env:{DB:db},
    request:new Request(`https://franchisehq.app/api/leagues/command-league/${endpoint}`, {
      method,
      headers:{
        Cookie:`${AUTH_CONSTANTS.SESSION_COOKIE_NAME}=${token}`,
        ...(body ? {'content-type':'application/json'} : {})
      },
      ...(body ? {body:JSON.stringify(body)} : {})
    })
  };
}

test('migration 32 backfills the private Rules workspace without changing published Rules or league settings', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys=ON');
    const files = await migrationFiles();
    await applyFiles(database, files.filter(file => !file.includes('/0032_')));
    seedLeague(database);
    database.prepare(`INSERT INTO league_settings
      (league_id,revision,settings_json) VALUES (?,?,?)`)
      .run('league-command',7,'{"tradeLimit":4}');
    database.prepare(`INSERT INTO league_rules_documents
      (league_id,rules_json) VALUES (?,?)`)
      .run('league-command','{"categories":[{"id":"existing","title":"Existing","sections":[]}]}');

    await applyFiles(database, files.filter(file => file.includes('/0032_')));

    assert.equal(database.prepare(`SELECT revision FROM league_settings
      WHERE league_id='league-command'`).get().revision,7);
    assert.equal(database.prepare(`SELECT rules_json AS rulesJson FROM league_rules_documents
      WHERE league_id='league-command'`).get().rulesJson,
      '{"categories":[{"id":"existing","title":"Existing","sections":[]}]}');
    assert.deepEqual({...database.prepare(`SELECT revision,base_publication_revision AS basePublicationRevision,
      draft_rules_json AS draftRulesJson FROM league_rules_workspaces
      WHERE league_id='league-command'`).get()}, {
      revision:1,
      basePublicationRevision:1,
      draftRulesJson:'{"categories":[{"id":"existing","title":"Existing","sections":[]}]}'
    });
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM league_features
      WHERE league_id='league-command' AND enabled=1`).get().count,4);
    assert.equal(database.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally {
    database.close();
  }
});

test('Rules drafts stay private, publishing is explicit, and stale commissioner revisions are rejected', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys=ON');
    await applyFiles(database, await migrationFiles());
    seedLeague(database);
    await seedIdentity(database,{id:'commissioner',role:'commissioner',token:'commissioner-token'});
    await seedIdentity(database,{id:'owner',role:'team_owner',teamId:'tb',token:'owner-token'});
    const published = {categories:[{id:'general',title:'General',sections:[{id:'conduct',title:'Conduct',rules:[{id:'rule-1',title:'Respect',text:'Respect every member.'}]}]}]};
    database.prepare(`INSERT INTO league_rules_documents
      (league_id,rules_json,updated_by_user_id) VALUES (?,?,?)`)
      .run('league-command',JSON.stringify(published),'commissioner');
    database.prepare(`INSERT INTO league_rule_publications
      (id,league_id,publication_revision,rules_json,published_by_user_id)
      VALUES (?,?,?,?,?)`).run('publication-1','league-command',1,JSON.stringify(published),'commissioner');
    database.prepare(`INSERT INTO league_rules_workspaces
      (league_id,revision,base_publication_revision,draft_rules_json,updated_by_user_id)
      VALUES (?,?,?,?,?)`).run('league-command',1,1,JSON.stringify(published),'commissioner');
    const db = d1(database);

    const ownerRead = await getRules(requestContext(db,'owner-token','rules'));
    const ownerPayload = await ownerRead.json();
    assert.equal(ownerRead.status,200);
    assert.equal(ownerPayload.workspace,undefined);
    assert.deepEqual(ownerPayload.rules,published);

    const draft = structuredClone(published);
    draft.categories[0].sections[0].rules[0].text = 'Respect every member and commissioner ruling.';
    const saved = await putRules(requestContext(db,'commissioner-token','rules','PUT',{
      action:'save-draft',revision:1,rules:draft
    }));
    const savedPayload = await saved.json();
    assert.equal(saved.status,200,JSON.stringify(savedPayload));
    assert.equal(savedPayload.workspace.revision,2);
    assert.equal(savedPayload.workspace.dirty,true);
    assert.deepEqual(JSON.parse(database.prepare(`SELECT rules_json AS rulesJson
      FROM league_rules_documents WHERE league_id='league-command'`).get().rulesJson),published);

    const stale = await putRules(requestContext(db,'commissioner-token','rules','PUT',{
      action:'save-draft',revision:1,rules:draft
    }));
    assert.equal(stale.status,409);
    assert.equal((await stale.json()).code,'RULES_REVISION_CONFLICT');

    const publication = await putRules(requestContext(db,'commissioner-token','rules','PUT',{
      action:'publish',revision:2,rules:draft
    }));
    const publicationPayload = await publication.json();
    assert.equal(publication.status,200,JSON.stringify(publicationPayload));
    assert.equal(publicationPayload.workspace.dirty,false);
    assert.equal(publicationPayload.publication.revision,2);
    assert.deepEqual((await (await getRules(requestContext(db,'owner-token','rules'))).json()).rules,draft);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM tenant_audit_events
      WHERE league_id='league-command'`).get().count,2);
  } finally {
    database.close();
  }
});

test('Commissioner HQ shares feature state through one guarded settings revision', async () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec('PRAGMA foreign_keys=ON');
    await applyFiles(database, await migrationFiles());
    seedLeague(database);
    await seedIdentity(database,{id:'commissioner',role:'commissioner',token:'commissioner-token'});
    await seedIdentity(database,{id:'owner',role:'team_owner',teamId:'tb',token:'owner-token'});
    database.prepare(`INSERT INTO league_settings
      (league_id,revision,settings_json,updated_by_user_id) VALUES (?,?,?,?)`)
      .run('league-command',1,'{}','commissioner');
    const db = d1(database);

    const forbidden = await postCommissionerHq(requestContext(db,'owner-token','commissioner-hq','POST',{
      action:'feature',featureKey:'trade_center',enabled:false,revision:1
    }));
    assert.equal(forbidden.status,403);

    const response = await postCommissionerHq(requestContext(db,'commissioner-token','commissioner-hq','POST',{
      action:'feature',featureKey:'trade_center',enabled:false,revision:1
    }));
    const payload = await response.json();
    assert.equal(response.status,200,JSON.stringify(payload));
    assert.equal(payload.settings.revision,2);
    assert.equal(payload.features.find(item => item.featureKey === 'trade_center').enabled,false);
    assert.equal(database.prepare(`SELECT enabled FROM league_features
      WHERE league_id='league-command' AND feature_key='trade_center'`).get().enabled,0);

    const stale = await postCommissionerHq(requestContext(db,'commissioner-token','commissioner-hq','POST',{
      action:'feature',featureKey:'trade_block',enabled:false,revision:1
    }));
    assert.equal(stale.status,409);
    assert.equal(database.prepare(`SELECT enabled FROM league_features
      WHERE league_id='league-command' AND feature_key='trade_block'`).get(),undefined);

    const overview = await getCommissionerHq(requestContext(db,'commissioner-token','commissioner-hq'));
    const overviewPayload = await overview.json();
    assert.equal(overview.status,200,JSON.stringify(overviewPayload));
    assert.equal(overviewPayload.release,'7.4.2');
    assert.equal(overviewPayload.memberships.active,2);
    assert.equal(overviewPayload.settings.revision,2);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM league_setting_revisions
      WHERE league_id='league-command' AND revision=2`).get().count,1);
  } finally {
    database.close();
  }
});

test('Rules input validation rejects empty text and duplicate identifiers', () => {
  assert.throws(() => normalizeRulesDocument({categories:[{
    id:'general',title:'General',sections:[{id:'conduct',title:'Conduct',rules:[{id:'rule-1',text:''}]}]
  }]}),/Rule text is required/);
  assert.throws(() => normalizeRulesDocument({categories:[
    {id:'duplicate',title:'One',sections:[]},
    {id:'duplicate',title:'Two',sections:[]}
  ]}),/Duplicate category id/);
});

test('Commissioner HQ exposes the complete command shell and phone-safe presentation', async () => {
  const [ui, styles, app] = await Promise.all([
    readFile(path.join(ROOT,'trade-module.js'),'utf8'),
    readFile(path.join(ROOT,'styles.css'),'utf8'),
    readFile(path.join(ROOT,'app.js'),'utf8')
  ]);
  for (const workspace of ['overview','league-data','teams','controls','rules','audit']) {
    assert.match(ui,new RegExp(`commissionerTabButton\\('${workspace}'`));
  }
  assert.match(ui,/League control room/);
  assert.match(ui,/People & Teams/);
  assert.match(ui,/Rules Studio/);
  assert.match(ui,/Audit & Revisions/);
  assert.match(ui,/window\.FranchiseHQ\?\.currentSeasonContext/);
  assert.match(styles,/@media\(max-width:760px\)/);
  assert.match(styles,/\.commissioner-tabs--command\{display:flex;overflow-x:auto/);
  assert.match(styles,/\.commissioner-feature-grid\{grid-template-columns:1fr\}/);
  assert.match(app,/function applyLeagueFeaturePresentation\(\)/);
  assert.match(app,/A league commissioner has turned this feature off/);
});
