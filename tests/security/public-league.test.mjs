import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {hashToken} from '../../functions/_lib/auth.js';
import {requireLeagueViewer} from '../../functions/_lib/public-league.js';
import {requireCommissioner} from '../../functions/_lib/permissions.js';
import {onRequest as leaguePage} from '../../functions/leagues/[[path]].js';
import {onRequestGet as metadata} from '../../functions/api/leagues/[leagueSlug]/index.js';
import {onRequestGet as snapshot} from '../../functions/api/leagues/[leagueSlug]/snapshot/read-model.js';
import {onRequestGet as team} from '../../functions/api/leagues/[leagueSlug]/teams/[teamSlug].js';
import {onRequestGet as news,onRequestPost as writeNews} from '../../functions/api/leagues/[leagueSlug]/news.js';
import {onRequestGet as rules,onRequestPut as writeRules} from '../../functions/api/leagues/[leagueSlug]/rules.js';
import {onRequestGet as media} from '../../functions/api/leagues/[leagueSlug]/rules-media/[[mediaId]].js';
import {onRequestGet as members} from '../../functions/api/leagues/[leagueSlug]/memberships.js';
import {onRequestGet as trades} from '../../functions/api/leagues/[leagueSlug]/trade-center.js';
import {onRequestGet as competition,onRequestPost as writeCompetition} from '../../functions/api/leagues/[leagueSlug]/competition.js';

async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  const migrations=new URL('../../migrations/',import.meta.url);
  for(const file of (await readdir(migrations)).filter(f=>/^\d+_.*\.sql$/.test(f)).sort())sqlite.exec(await readFile(new URL(file,migrations),'utf8'));
  const writes=[];
  const db={prepare(sql){let values=[];return{bind(...v){values=v;return this},async first(){return sqlite.prepare(sql).get(...values)||null},async all(){return{results:sqlite.prepare(sql).all(...values)}},async run(){writes.push(sql);return{success:true,meta:{changes:Number(sqlite.prepare(sql).run(...values).changes)}}}}}};
  db.batch=async statements=>{sqlite.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results}catch(e){sqlite.exec('ROLLBACK');throw e}};
  for(const slug of ['alpha','beta','disabled']){
    sqlite.prepare(`INSERT INTO leagues(id,name,slug,public_status,tenant_status,configuration_json) VALUES (?,?,?,'active',?,?)`).run(slug,slug+' League',slug,slug==='disabled'?'disabled':'enabled',JSON.stringify({privateSetting:'DO_NOT_PUBLISH'}));
    if(slug==='disabled')continue;
    sqlite.prepare(`INSERT INTO league_features(league_id,feature_key,enabled,configuration_json) VALUES (?,'trade_center',1,'{"privateSetting":"DO_NOT_PUBLISH"}')`).run(slug);
    sqlite.prepare(`INSERT INTO league_snapshots(id,league_id,status,season_year,week_index,team_count,player_count,game_count,standing_count,manifest_json) VALUES (?,?,'active',2027,13,1,1,1,1,'{}')`).run('snap-'+slug,slug);
    sqlite.prepare('INSERT INTO league_active_snapshots(league_id,snapshot_id) VALUES (?,?)').run(slug,'snap-'+slug);
    const rows={teams:{external_id:'1',abbreviation:'TB',display_name:slug+' Buccaneers'},players:{external_id:'2',team_external_id:'1',display_name:slug+' Quarterback',position:'QB',overall:90},games:{external_id:'3',home_team_external_id:'1',away_team_external_id:'4',status:'completed',home_score:24,away_score:17},standings:{external_id:'1',team_external_id:'1',wins:9,losses:3},statistics:{external_id:'5',player_external_id:'2',team_external_id:'1',category:'passing',metrics_json:'{"passYds":300}'}};
    for(const [domain,data] of Object.entries(rows))sqlite.prepare('INSERT INTO league_snapshot_records(league_id,snapshot_id,domain,external_id,data_json) VALUES (?,?,?,?,?)').run(slug,'snap-'+slug,domain,data.external_id,JSON.stringify({...data,email:'DO_NOT_PUBLISH',session_token:'DO_NOT_PUBLISH'}));
  }
  sqlite.exec("INSERT INTO league_slug_aliases(alias_slug,league_id) VALUES ('alpha-alias','alpha')");
  sqlite.exec("INSERT INTO users(id,discord_user_id,discord_username,display_name) VALUES ('owner','123456789012345678','owner','Commissioner')");
  sqlite.exec("INSERT INTO league_memberships(id,league_id,user_id,role,active) VALUES ('member','alpha','owner','commissioner',1)");
  const token='public-test-session';const hash=await hashToken(token);
  sqlite.prepare("INSERT INTO sessions(id,user_id,session_token_hash,expires_at,absolute_expires_at,last_rotated_at,csrf_token_hash) VALUES ('session','owner',?,'2099-01-01','2099-01-01','2099-01-01',?)").run(hash,await hashToken('test-csrf'));
  for(const status of ['published','draft'])sqlite.prepare("INSERT INTO league_news_posts(id,league_id,category,title,summary,body,status,author_user_id,published_at) VALUES (?,'alpha','News',?,'Summary','Body',?,'owner',CURRENT_TIMESTAMP)").run(status,status,status);
  sqlite.exec("INSERT INTO league_rules_documents(league_id,rules_json) VALUES ('alpha','{\"categories\":[{\"sections\":[{\"rules\":[{\"media\":[{\"id\":\"rule_media_published\"}]}]}]}]}')");
  for(const id of ['published','draft'])sqlite.prepare("INSERT INTO league_rule_media(id,league_id,object_key,content_type,byte_length,uploaded_by_user_id) VALUES (?,'alpha',?,'image/png',3,'owner')").run('rule_media_'+id,id);
  const objects=[];
  const context=(path,method='GET',signedIn=false)=>({request:new Request('https://franchisehq.app'+path,{method,headers:signedIn?{cookie:'franchise_hq_session='+token+'; franchise_hq_csrf=test-csrf'}:{}}),params:{leagueSlug:path.match(/\/leagues\/([^/?]+)/)?.[1],teamSlug:'tb',mediaId:path.split('/').at(-1)},env:{DB:db,FRANCHISE_HQ_DB:db,ASSETS:{fetch:async()=>new Response('<html><head></head><body><script src="app.js"></script></body></html>')},COMPANION_EXPORTS:{get:async key=>{objects.push(key);return{body:'png'}}}},next:async()=>new Response('next')});
  return{sqlite,context,writes,objects};
}

test('anonymous league and deep links render the live shell without login or new memberships',async()=>{
  const f=await fixture();try{
    for(const path of ['/leagues/alpha','/leagues/alpha/teams/tb','/leagues/alpha/players/plr_0123456789abcdef0123456789abcdef','/leagues/alpha-alias/teams/tb']){
      const response=await leaguePage(f.context(path));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const html=await response.text();assert.match(html,/__FHQ_PUBLIC_VIEW__/);assert.match(html,/app.js/);assert.doesNotMatch(html,/__FHQ_AUTH_BOOTSTRAP__|location.replace/);
      const bootstrap=JSON.parse(html.match(/window\.__FHQ_PUBLIC_VIEW__=(.*?);<\/script>/)[1]);
      assert.equal(bootstrap.tenant.id,'alpha');assert.equal(bootstrap.tenant.slug,'alpha');
      assert.equal(bootstrap.requestedSlug,path.split('/')[2]);
      assert.deepEqual(bootstrap.tenant.features,{trade_center:{enabled:true}});
      assert.doesNotMatch(JSON.stringify(bootstrap),/DO_NOT_PUBLISH|configuration|discord_user_id/);
    }
    assert.equal((await leaguePage(f.context('/leagues/disabled'))).status,404);
    assert.equal((await leaguePage(f.context('/leagues/missing'))).status,404);
    const join=await leaguePage(f.context('/leagues/alpha?join=1'));assert.equal(join.headers.get('x-franchisehq-auth-bridge'),'exact-route');
    assert.equal(f.writes.length,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM league_memberships').get().n,1);
  }finally{f.sqlite.close()}
});

test('public metadata and every live snapshot domain stay tenant scoped and omit account/configuration secrets',async()=>{
  const f=await fixture();try{
    for(const slug of ['alpha','beta']){
      const data=await(await metadata(f.context('/api/leagues/'+slug))).json();assert.equal(data.tenant.slug,slug);assert.equal(data.tenant.counts.players,1);assert.doesNotMatch(JSON.stringify(data),/DO_NOT_PUBLISH/);
      for(const domain of ['teams','players','games','statistics','standings']){
        const c=f.context('/api/leagues/'+slug+'/snapshot/read-model?domain='+domain+'&league=alpha&snapshotId=snap-alpha');
        const response=await snapshot(c),payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));assert.equal(payload.league.id,slug);assert.equal(payload.snapshot.id,'snap-'+slug);assert.equal(payload.records.length,1);assert.doesNotMatch(JSON.stringify(payload),/DO_NOT_PUBLISH/);
        if(domain==='players')assert.equal(payload.records[0].displayName,slug+' Quarterback');
      }
      assert.equal((await team(f.context('/api/leagues/'+slug+'/teams/tb'))).status,200);
    }
    assert.equal((await snapshot(f.context('/api/leagues/disabled/snapshot/read-model'))).status,404);
    assert.equal((await snapshot(f.context('/api/leagues/alpha/snapshot/read-model?domain=players&bulk=1'))).status,400);
    assert.equal(f.writes.length,0);
  }finally{f.sqlite.close()}
});

test('public news and rules show published content and never reveal drafts or unpublished images',async()=>{
  const f=await fixture();try{
    const response=await news(f.context('/api/leagues/alpha/news?drafts=1'));const body=await response.json();assert.equal(response.status,200);assert.deepEqual(body.posts.map(x=>x.id),['published']);assert.equal(body.posts[0].author.id,undefined);
    assert.equal((await rules(f.context('/api/leagues/alpha/rules'))).status,200);
    assert.equal((await media(f.context('/api/leagues/alpha/rules-media/rule_media_published'))).status,200);
    assert.equal((await media(f.context('/api/leagues/alpha/rules-media/rule_media_draft'))).status,404);assert.deepEqual(f.objects,['published']);
    const outsider=await(await news(f.context('/api/leagues/beta/news?drafts=1','GET',true))).json();assert.deepEqual(outsider.posts,[]);
    const member=await(await news(f.context('/api/leagues/alpha/news?drafts=1','GET',true))).json();assert.equal(member.posts.length,2);
  }finally{f.sqlite.close()}
});

test('anonymous operational reads and mutations remain denied; viewer access never grants membership',async()=>{
  const f=await fixture();try{
    for(const [handler,path] of [[members,'memberships'],[trades,'trade-center'],[competition,'competition']])assert.equal((await handler(f.context('/api/leagues/alpha/'+path))).status,401,path);
    for(const [handler,path] of [[writeNews,'news'],[writeRules,'rules'],[writeCompetition,'competition']])assert.equal((await handler(f.context('/api/leagues/alpha/'+path,'POST'))).status,401,path);
    for(const method of ['POST','PUT','PATCH','DELETE'])assert.equal((await requireLeagueViewer(f.context('/api/leagues/alpha',method))).response.status,405);
    assert.equal((await requireCommissioner(f.context('/api/leagues/alpha'))).authorized,false);assert.equal(f.writes.length,0);
    assert.equal((await requireCommissioner(f.context('/api/leagues/alpha','GET',true))).authorized,true);
    assert.equal((await requireCommissioner(f.context('/api/leagues/beta','GET',true))).authorized,false);
  }finally{f.sqlite.close()}
});

test('signed-in nonmembers and pending members can browse while join and active-member access remain intact',async()=>{
  const f=await fixture();try{
    assert.doesNotMatch(await(await leaguePage(f.context('/leagues/alpha','GET',true))).text(),/__FHQ_PUBLIC_VIEW__/);
    assert.match(await(await leaguePage(f.context('/leagues/beta','GET',true))).text(),/__FHQ_PUBLIC_VIEW__/);
    assert.match(await(await leaguePage(f.context('/leagues/beta?join=1','GET',true))).text(),/Request league access/);
    f.sqlite.exec("INSERT INTO league_memberships(id,league_id,user_id,role,active) VALUES ('pending','beta','owner','team_owner',0)");
    assert.match(await(await leaguePage(f.context('/leagues/beta','GET',true))).text(),/__FHQ_PUBLIC_VIEW__/);
    assert.equal((await leaguePage(f.context('/leagues/beta?join=1','GET',true))).headers.get('x-fhq-membership-state'),'pending');
  }finally{f.sqlite.close()}
});

test('public UI keeps deep sign-in links and denies simulated management permissions',async()=>{
  const view={readOnly:true,slug:'alpha'};const location={pathname:'/leagues/alpha/teams/tb',search:'',hash:'#roster'};
  const HQ={defineService(name,value){this[name]=value},simulation:{getRole:()=> 'commissioner',getTeam:()=>({id:'tb'})}};
  const context={window:{__FHQ_PUBLIC_VIEW__:view,FranchiseHQ:HQ},document:{addEventListener(){}},location,Set,encodeURIComponent};
  runInNewContext(await readFile(new URL('../../assets/public-league.js',import.meta.url),'utf8'),context);
  for(const route of ['home','teams/tb','players/123','standings','stats','schedule','news'])assert.equal(view.canBrowse(route),true);
  for(const route of ['commissioner','trade-center','transactions','my-team'])assert.equal(view.canBrowse(route),false);
  assert.equal(view.signInPath(),'/auth?returnTo='+encodeURIComponent('/leagues/alpha/teams/tb#roster'));
  runInNewContext(await readFile(new URL('../../platform/permissions.js',import.meta.url),'utf8'),context);
  assert.equal(HQ.permissions.canOpenCommissionerHQ(),false);assert.equal(HQ.permissions.canCreateTrade(),false);
});

test('visitor banner opens rosters directly and presentation leaves public content visible',async()=>{
  const node=()=>({children:[],dataset:{},hidden:false,append(...items){this.children.push(...items)},prepend(item){this.children.unshift(item)},setAttribute(){},addEventListener(){},classList:{add(){}}});
  const main=node(),content=node(),teams=node(),management=node(),tradeAction=node();
  main.append(content);teams.dataset.route='teams';management.dataset.route='commissioner';
  const listeners=new Map();let observe;
  const document={body:node(),createElement:node,querySelector:selector=>selector==='#main-content'?main:null,
    querySelectorAll:selector=>selector==='[data-route]'?[teams,management]:[tradeAction],
    addEventListener:(name,callback)=>listeners.set(name,callback)};
  const context={window:{__FHQ_PUBLIC_VIEW__:{slug:'alpha',readOnly:true}},document,
    location:{pathname:'/leagues/alpha',search:'',hash:''},
    MutationObserver:class{constructor(callback){observe=callback}observe(){}}};
  runInNewContext(await readFile(new URL('../../assets/public-league.js',import.meta.url),'utf8'),context);
  listeners.get('DOMContentLoaded')();
  const actions=main.children[0].children[1].children;
  assert.equal(actions[0].textContent,'Browse rosters');assert.equal(actions[0].href,'/leagues/alpha#teams');assert.equal(actions[0].dataset.route,'teams');
  assert.equal(teams.hidden,false);assert.equal(content.hidden,false);assert.equal(management.hidden,true);assert.equal(tradeAction.hidden,true);
  management.hidden=false;observe();assert.equal(management.hidden,true);
});
