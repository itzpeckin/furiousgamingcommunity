import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  appendBrowserSessionCookies,
  getCurrentSession,
  hashToken,
  issueBrowserSession,
  rotateBrowserSession,
  verifyMutationCsrf
} from '../../functions/_lib/auth.js';
import { onRequestPost as logout } from '../../functions/api/auth/logout.js';
import { onRequest as middleware } from '../../functions/_middleware.js';
import { onRequest as leagueDocument } from '../../functions/leagues/[[path]].js';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';

function d1(database) {
  const statement = (sql, values = []) => ({
    sql,
    values,
    bind(...next) { return statement(sql, next); },
    async first() { return database.prepare(sql).get(...values) || null; },
    async all() { return { results:database.prepare(sql).all(...values) }; },
    async run() {
      const result = database.prepare(sql).run(...values);
      return { success:true, meta:{ changes:Number(result.changes || 0) } };
    }
  });
  return {
    prepare:sql => statement(sql),
    async batch(statements) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const results=[];
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

async function fixture() {
  const database=new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  const migrations=(await walkFiles())
    .filter(file=>/^migrations\/\d+_.+\.sql$/.test(file))
    .sort();
  for (const file of migrations) database.exec(await readFile(path.join(ROOT,file),'utf8'));
  database.prepare(`INSERT INTO leagues
    (id,name,product_name,slug,public_status,tenant_status,timezone)
    VALUES (?,?,?,?,?,?,?)`).run(
      'league-1','FGC','FranchiseHQ','fgc','active','enabled','America/Chicago'
    );
  database.prepare(`INSERT INTO users
    (id,discord_user_id,discord_username,display_name) VALUES (?,?,?,?)`)
    .run('user-1','discord-1','owner','Owner');
  database.prepare(`INSERT INTO league_memberships
    (id,league_id,user_id,role,team_id,active) VALUES (?,?,?,?,?,1)`)
    .run('membership-1','league-1','user-1','commissioner','tb');
  return { database, DB:d1(database) };
}

function authRequest(session, options = {}) {
  const method=options.method || 'GET';
  const headers=new Headers(options.headers || {});
  headers.set('cookie', `franchise_hq_session=${session.rawSessionToken}; franchise_hq_csrf=${session.rawCsrfToken}`);
  if (options.origin !== false && !['GET','HEAD'].includes(method)) headers.set('origin','https://franchisehq.app');
  if (options.csrf !== false && !['GET','HEAD'].includes(method)) headers.set('x-franchisehq-csrf',session.rawCsrfToken);
  return new Request(options.url || 'https://franchisehq.app/api/leagues/fgc/test', {
    method,
    headers,
    body:options.body
  });
}

test('7.5 issues one hashed public-domain session with independent CSRF and fixed expiry', async () => {
  const {database,DB}=await fixture();
  try {
    const session=await issueBrowserSession({
      request:new Request('https://franchisehq.app/api/auth/discord/callback',{headers:{'user-agent':'Desktop Browser'}}),
      env:{DB}
    },'user-1',{leagueId:'league-1'});
    const stored=database.prepare(`SELECT session_token_hash AS tokenHash,csrf_token_hash AS csrfHash,
      expires_at AS expiresAt,absolute_expires_at AS absoluteExpiresAt,recovery_mode AS recoveryMode
      FROM sessions WHERE id=?`).get(session.sessionId);
    assert.equal(stored.tokenHash,await hashToken(session.rawSessionToken));
    assert.equal(stored.csrfHash,await hashToken(session.rawCsrfToken));
    assert.notEqual(stored.tokenHash,session.rawSessionToken);
    assert.equal(stored.recoveryMode,'standard');
    assert.ok(Date.parse(stored.expiresAt)<Date.parse(stored.absoluteExpiresAt));
    assert.equal(database.prepare(`SELECT event_type AS eventType FROM session_security_events
      WHERE session_id=?`).get(session.sessionId).eventType,'issued');

    const headers=new Headers();
    appendBrowserSessionCookies(headers,session);
    const cookies=headers.getSetCookie();
    assert.equal(cookies.filter(value=>value.startsWith('franchise_hq_session=')).length,1);
    assert.equal(cookies.filter(value=>value.startsWith('franchise_hq_csrf=')).length,1);
    assert.ok(cookies.some(value=>value.startsWith('franchise_hq_session_recovery=') && value.includes('Max-Age=0')));
  } finally { database.close(); }
});

test('idle renewal is capped by absolute expiry and scheduled rotation invalidates the parent token', async () => {
  const {database,DB}=await fixture();
  try {
    const issued=await issueBrowserSession({
      request:new Request('https://franchisehq.app/api/auth/discord/callback'),env:{DB}
    },'user-1',{leagueId:'league-1'});
    database.prepare(`UPDATE sessions SET last_rotated_at=datetime('now','-2 days') WHERE id=?`).run(issued.sessionId);
    const request=authRequest(issued,{url:'https://franchisehq.app/api/auth/me?league=fgc'});
    const current=await getCurrentSession({request,env:{DB}},{leagueId:'league-1'});
    assert.equal(current.needsRotation,true);
    assert.equal(current.capabilities.includes('league:manage'),true);
    assert.ok(Date.parse(current.expiresAt)<=Date.parse(current.absoluteExpiresAt));

    const rotated=await rotateBrowserSession({request,env:{DB}},current);
    assert.equal(rotated.rotated,true);
    assert.equal(rotated.absoluteExpiresAt,issued.absoluteExpiresAt);
    assert.equal(database.prepare(`SELECT revocation_reason AS reason FROM sessions WHERE id=?`)
      .get(issued.sessionId).reason,'rotated');
    assert.equal(database.prepare(`SELECT parent_session_id AS parentId FROM sessions WHERE id=?`)
      .get(rotated.sessionId).parentId,issued.sessionId);
    assert.equal(await getCurrentSession({request,env:{DB}},{leagueId:'league-1'}),null);
  } finally { database.close(); }
});

test('expired sessions fail closed and retain an expiry audit event', async () => {
  const {database,DB}=await fixture();
  try {
    const issued=await issueBrowserSession({request:new Request('https://franchisehq.app/login'),env:{DB}},
      'user-1',{leagueId:'league-1'});
    database.prepare(`UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?`).run(issued.sessionId);
    const request=authRequest(issued,{url:'https://franchisehq.app/api/auth/me?league=fgc'});
    assert.equal(await getCurrentSession({request,env:{DB}},{leagueId:'league-1'}),null);
    assert.equal(database.prepare(`SELECT revocation_reason AS reason FROM sessions WHERE id=?`)
      .get(issued.sessionId).reason,'idle-expiry');
    assert.equal(database.prepare(`SELECT event_type AS eventType FROM session_security_events
      WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`).get(issued.sessionId).eventType,'expired');
  } finally { database.close(); }
});

test('browser mutations require exact same-origin evidence and the session-bound CSRF token', async () => {
  const {database,DB}=await fixture();
  try {
    const issued=await issueBrowserSession({request:new Request('https://franchisehq.app/login'),env:{DB}},
      'user-1',{leagueId:'league-1'});
    const validContext={request:authRequest(issued,{method:'POST'}),env:{DB}};
    assert.equal((await verifyMutationCsrf(validContext)).valid,true);
    assert.equal((await verifyMutationCsrf({
      ...validContext,
      request:authRequest(issued,{method:'POST',csrf:false})
    })).valid,false);

    const missingOrigin=await middleware({
      request:authRequest(issued,{method:'POST',origin:false}),env:{DB},next:async()=>new Response('changed')
    });
    assert.equal(missingOrigin.status,403);
    assert.equal((await missingOrigin.json()).code,'MUTATION_ORIGIN_REJECTED');

    const missingCsrf=await middleware({
      request:authRequest(issued,{method:'POST',csrf:false}),env:{DB},next:async()=>new Response('changed')
    });
    assert.equal(missingCsrf.status,403);
    assert.equal((await missingCsrf.json()).code,'CSRF_VALIDATION_FAILED');

    const accepted=await middleware({
      request:authRequest(issued,{method:'POST'}),env:{DB},next:async()=>new Response(null,{status:204})
    });
    assert.equal(accepted.status,204);
  } finally { database.close(); }
});

test('logout revokes the server session, records the event, and clears every browser credential', async () => {
  const {database,DB}=await fixture();
  try {
    const issued=await issueBrowserSession({request:new Request('https://franchisehq.app/login'),env:{DB}},
      'user-1',{leagueId:'league-1'});
    const request=authRequest(issued,{method:'POST',url:'https://franchisehq.app/api/auth/logout'});
    const response=await middleware({
      request,
      env:{DB},
      next:()=>logout({request,env:{DB}})
    });
    assert.equal(response.status,200);
    assert.ok(database.prepare(`SELECT revoked_at FROM sessions WHERE id=?`).get(issued.sessionId).revoked_at);
    assert.equal(database.prepare(`SELECT event_type AS eventType FROM session_security_events
      WHERE session_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1`).get(issued.sessionId).eventType,'logged_out');
    const cookies=response.headers.getSetCookie();
    for (const name of ['franchise_hq_session','franchise_hq_session_recovery','franchise_hq_csrf']) {
      assert.ok(cookies.some(value=>value.startsWith(`${name}=`) && value.includes('Max-Age=0')));
    }
  } finally { database.close(); }
});

test('desktop and mobile protected routes preserve the exact league URL with server capabilities', async () => {
  for (const userAgent of ['Desktop Browser','Mobile Safari iPhone']) {
    const {database,DB}=await fixture();
    try {
      const issued=await issueBrowserSession({request:new Request('https://franchisehq.app/login',{headers:{'user-agent':userAgent}}),env:{DB}},
        'user-1',{leagueId:'league-1'});
      const request=authRequest(issued,{
        url:'https://franchisehq.app/leagues/fgc',
        headers:{'user-agent':userAgent,accept:'text/html'}
      });
      const response=await leagueDocument({
        request,
        env:{
          DB,
          ASSETS:{fetch:async()=>new Response('<!doctype html><html><head></head><body>League</body></html>',{
            headers:{'content-type':'text/html'}
          })}
        }
      });
      assert.equal(response.status,200);
      const html=await response.text();
      assert.match(html,/__FHQ_AUTH_BOOTSTRAP__/);
      assert.match(html,/league:manage/);
      assert.equal(response.headers.get('x-fhq-route-fix'),'7.5.0');
    } finally { database.close(); }
  }
});
