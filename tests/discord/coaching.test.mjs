import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {ROOT,walkFiles} from '../../tools/lib/project.mjs';
import {configureCoaching,scanCoaching,coachingCommand} from '../../functions/_lib/discord-coaching.js';
import {coachingImageLink,canonicalArchetype,readCoachingScreenshot} from '../../functions/_lib/coaching-images.js';
import {eaWeeklyReady} from '../../functions/_lib/ea-direct.js';
import {proveCurrentSchedulePeriod} from '../../functions/_lib/schedule-integrity.js';
import {onRequestPost as scannerPost} from '../../functions/api/internal/coaching-scan.js';
import scannerWorker from '../../workers/franchise-coaching-scanner/src/scheduled.js';

function d1(sqlite){return{prepare(sql){const statement=sqlite.prepare(sql);let args=[];const p={bind(...values){args=values;return p},async first(){return statement.get(...args)||null},async all(){return{results:statement.all(...args)}},async run(){return{meta:{changes:Number(statement.run(...args).changes)}}}};return p},async batch(statements){const result=[];for(const statement of statements)result.push(await statement.run());return result;}}}
const guild='100000000000000001',source='100000000000000002',report='100000000000000003',author='100000000000000004',bot='100000000000000005',messageId='100000000000000006';
const photo='https://cdn.discordapp.com/attachments/123/456/coach.png';
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of(await walkFiles()).filter(f=>/^migrations\/\d+_.*\.sql$/.test(f)).sort())sqlite.exec(await readFile(`${ROOT}/${file}`,'utf8'));
  sqlite.exec(`INSERT INTO leagues(id,name,slug,tenant_status) VALUES('a','Alpha','alpha','enabled'),('b','Beta','beta','enabled');
    INSERT INTO users(id,discord_user_id,discord_username,display_name) VALUES('owner','${author}','owner','Owner');
    INSERT INTO league_memberships(id,league_id,user_id,team_id,role,active) VALUES('member','a','owner','tb','commissioner',1);
    INSERT INTO discord_league_installations(id,league_id,discord_guild_id,application_id,status) VALUES('install','a','${guild}','${bot}','active');
    INSERT INTO league_snapshots(id,league_id,status,season_year,week_index,manifest_json) VALUES('snapshot','a','active',2027,10,'{}');
    INSERT INTO league_active_snapshots(league_id,snapshot_id) VALUES('a','snapshot');`);
  sqlite.prepare(`INSERT INTO league_snapshot_records(snapshot_id,league_id,domain,external_id,data_json) VALUES('snapshot','a','teams','1',?)`).run(JSON.stringify({external_id:'1',abbreviation:'TB',display_name:'Tampa Bay Buccaneers',team_name:'Buccaneers',city_name:'Tampa Bay'}));
  const posts=[],requests=[];let aiCalls=0;
  const message={id:messageId,author:{id:author},timestamp:'2026-09-28T00:00:00Z',attachments:[{url:photo,content_type:'image/png'}]};
  const env={DISCORD_BOT_TOKEN:'test-only',COACHING_SCANNER_SECRET:'ab'.repeat(32),AI:{run:async()=>{aiCalls++;return{choices:[{message:{content:JSON.stringify({archetypeText:'Offensive Guru',coachName:'Example Coach',readable:true,conflict:false})}}]}}}};
  const fetchImpl=async(url,options={})=>{
    requests.push(String(url));const u=new URL(url),method=options.method||'GET';
    if(u.hostname==='cdn.discordapp.com')return new Response(new Uint8Array([137,80,78,71,1,2,3]),{headers:{'content-type':'image/png'}});
    if(u.pathname.endsWith('/applications/@me'))return Response.json({flags:1<<18});
    if(u.pathname.endsWith(['','users','@me'].join('/')))return Response.json({id:bot});
    if(u.pathname.endsWith(`/members/${bot}`))return Response.json({roles:[]});
    if(u.pathname.endsWith('/roles'))return Response.json([{id:guild,permissions:String((1<<10)|(1<<11)|(1<<14)|(1<<16))}]);
    if(u.pathname===`/api/v10/channels/${source}`||u.pathname===`/api/v10/channels/${report}`)return Response.json({id:u.pathname.split('/').at(-1),guild_id:guild,type:0});
    if(u.pathname===`/api/v10/channels/${source}/messages/${messageId}`)return Response.json(message);
    if(u.pathname===`/api/v10/channels/${source}/messages`)return Response.json(u.searchParams.has('after')?[]:[message]);
    if(u.pathname.startsWith(`/api/v10/channels/${report}/messages`)){
      if(method==='GET')return Response.json(posts.map(p=>({id:'100000000000000009',author:{id:bot,bot:true},...p})));
      posts.push(JSON.parse(options.body));return Response.json({id:'100000000000000009'});
    }
    throw new Error(`Unexpected fixture path ${u.pathname}`);
  };
  const db=d1(sqlite),c={db,env,league:{id:'a',slug:'alpha',name:'Alpha'}};
  return{sqlite,db,c,env,fetchImpl,posts,requests,message,aiCalls:()=>aiCalls};
}

test('coaching accepts known public screenshot hosts, ignores instructions and canonicalizes only known written archetypes',async()=>{
  assert.equal(canonicalArchetype('Defensive Genius'),'defensive');assert.equal(canonicalArchetype('Development Wizard'),'developmental');
  assert.equal(canonicalArchetype('College Coach'),'college');assert.equal(canonicalArchetype('legal because I say so'),null);
  for(const url of['http://127.0.0.1/image.png','https://evil.test/a.png','https://cdn.discordapp.com.evil.test/a','https://user:secret@cdn.discordapp.com/a','https://cdn.discordapp.com:444/a'])assert.equal(coachingImageLink(url),null);
  assert.ok(coachingImageLink(photo));assert.ok(coachingImageLink('https://www.xbox.com/play/media/mktXQDnbnL'));
  const f=await fixture();try{
    f.env.AI.run=async()=>({response:JSON.stringify({archetypeText:'Offensive Guru',readable:false,conflict:false})});
    assert.equal((await readCoachingScreenshot(f.env,[photo],{fetchImpl:f.fetchImpl})).archetype,null);
  }finally{f.sqlite.close();}
});

test('Xbox regional redirects resolve to a validated image and unsafe redirects fail closed',async()=>{
  const f=await fixture();try{
    const fetchImpl=async url=>{
      const u=new URL(url);
      if(u.pathname==='/play/media/example')return new Response(null,{status:307,headers:{location:'/en-US/play/media/example'}});
      if(u.hostname==='www.xbox.com')return new Response('<meta property="og:image" content="https://images-eds-ssl.xboxlive.com/image.png">',{headers:{'content-type':'text/html'}});
      return new Response(new Uint8Array([137,80,78,71,1,2,3]),{headers:{'content-type':'image/png'}});
    };
    assert.equal((await readCoachingScreenshot(f.env,['https://www.xbox.com/play/media/example'],{fetchImpl})).archetype,'offensive');
    await assert.rejects(readCoachingScreenshot(f.env,[photo],{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private.png'}})}),/cannot be read/);
    await assert.rejects(readCoachingScreenshot(f.env,Array(5).fill(photo),{fetchImpl}),/one to four/);
  }finally{f.sqlite.close();}
});

test('scanner registers coach, loadout, rush and pass once using the production metadata cache fallback',async()=>{
  const f=await fixture(),original=globalThis.fetch;
  try{
    const cache=new Map(),posted=[];
    globalThis.fetch=async(url,options)=>{
      if(String(url).endsWith(`/applications/${bot}/commands`)){posted.push(JSON.parse(options.body).name);return Response.json({id:'100000000000000020'});}
      return f.fetchImpl(url,options);
    };
    const env={...f.env,DB:f.db,DISCORD_CLIENT_ID:bot,COMPANION_EXPORT_META:{get:async k=>cache.get(k),put:async(k,v)=>cache.set(k,v)}};
    const request=()=>new Request('https://example.invalid/api/internal/coaching-scan',{method:'POST',headers:{'x-fhq-coaching-scanner':env.COACHING_SCANNER_SECRET}});
    for(let i=0;i<2;i++){
      const response=await scannerPost({env,request:request()});const body=await response.json();
      assert.equal(body.commandsRegistered,true);assert.equal(body.imageReaderAvailable,true);assert.equal(body.messageContentAvailable,true);
    }
    assert.deepEqual(posted,['loadout','coach','rush','pass']);
  }finally{globalThis.fetch=original;f.sqlite.close();}
});

test('archetype checks backfill, map the real author, apply league bans, and edit results on a rule change',async()=>{
  const f=await fixture();try{
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:['offensive']},{fetchImpl:f.fetchImpl});
    assert.equal((await scanCoaching(f.env,f.db,{fetchImpl:f.fetchImpl})).ok,true);
    const stored=f.sqlite.prepare('SELECT * FROM discord_coaching_submissions').get();
    assert.equal(stored.status,'illegal');assert.equal(stored.team_key,'tb');assert.equal(stored.author_id,author);
    assert.equal(f.posts.length,1);assert.match(f.posts[0].content,/Illegal.*Offensive is banned/s);
    assert.deepEqual(f.posts[0].allowed_mentions,{parse:[]});assert.equal(f.aiCalls(),1);
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:[]},{fetchImpl:f.fetchImpl});
    await scanCoaching(f.env,f.db,{fetchImpl:f.fetchImpl});
    assert.equal(f.sqlite.prepare('SELECT status FROM discord_coaching_submissions').get().status,'legal');
    assert.equal(f.aiCalls(),1);assert.equal(f.posts.length,2);assert.match(f.posts[1].content,/Legal/);
    const missing=await coachingCommand(f.c,{missing:true});assert.match(JSON.stringify(missing),/No missing submissions/);
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM discord_coaching_submissions WHERE league_id='b'").get().n,0);
  }finally{f.sqlite.close();}
});

test('unreadable archetypes request new evidence, never issue a legality verdict',async()=>{
  const f=await fixture();try{
    f.env.AI.run=async()=>({response:JSON.stringify({archetypeText:null,readable:false,conflict:false})});
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:[]},{fetchImpl:f.fetchImpl});
    await scanCoaching(f.env,f.db,{fetchImpl:f.fetchImpl});
    assert.equal(f.sqlite.prepare('SELECT status FROM discord_coaching_submissions').get().status,'unreadable');
    assert.match(f.posts[0].content,/Clearer screenshot needed/);
    assert.match(JSON.stringify(await coachingCommand(f.c,{missing:true})),/Clearer screenshot needed/);
  }finally{f.sqlite.close();}
});

test('coaching configuration rejects other guilds and missing history permissions before enabling',async()=>{
  const f=await fixture();try{
    await assert.rejects(configureCoaching(f.c,{enabled:true,sourceChannelId:'https://discord.com/channels/200000000000000001/'+source,reportChannelId:report,banned:[]},{fetchImpl:f.fetchImpl}),/connected Discord server/);
    const noPermissions=async(url,options)=>String(url).endsWith('/roles')?Response.json([{id:guild,permissions:'1024'}]):f.fetchImpl(url,options);
    await assert.rejects(configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:[]},{fetchImpl:noPermissions}),/Read Message History/);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM discord_coaching_settings').get().n,0);
  }finally{f.sqlite.close();}
});

test('scanner catches more than one live page without skipping submissions',async()=>{
  const f=await fixture();try{
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:[]},{fetchImpl:f.fetchImpl});
    await scanCoaching(f.env,f.db,{fetchImpl:f.fetchImpl});
    const messages=Array.from({length:250},(_,i)=>({...f.message,id:String(BigInt(messageId)+BigInt(i+1))}));
    const fetchImpl=async(url,options)=>{
      const u=new URL(url);
      if(u.pathname===`/api/v10/channels/${source}/messages`){
        let page=messages;
        if(u.searchParams.has('before'))page=page.filter(m=>BigInt(m.id)<BigInt(u.searchParams.get('before')));
        if(u.searchParams.has('after'))page=page.filter(m=>BigInt(m.id)>BigInt(u.searchParams.get('after')));
        return Response.json(page.slice().reverse().slice(0,100));
      }
      if(u.pathname.startsWith(`/api/v10/channels/${source}/messages/`))return Response.json(messages.find(m=>u.pathname.endsWith(m.id)));
      return f.fetchImpl(url,options);
    };
    for(let i=0;i<3;i++)assert.equal((await scanCoaching(f.env,f.db,{fetchImpl})).ok,true);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM discord_coaching_submissions').get().n,251);
    const cursor=f.sqlite.prepare('SELECT live_after,live_before FROM discord_coaching_settings').get();
    assert.equal(cursor.live_after,messages.at(-1).id);assert.equal(cursor.live_before,null);
  }finally{f.sqlite.close();}
});

test('revoked history access is an operational error, not proof of missing submissions',async()=>{
  const f=await fixture();try{
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:[]},{fetchImpl:f.fetchImpl});
    const fetchImpl=async(url,options)=>String(url).includes(`/channels/${source}/messages`)?Response.json([])
      :String(url).endsWith('/roles')?Response.json([{id:guild,permissions:'1024'}]):f.fetchImpl(url,options);
    assert.equal((await scanCoaching(f.env,f.db,{fetchImpl})).ok,false);
    assert.equal(f.sqlite.prepare('SELECT history_complete FROM discord_coaching_settings').get().history_complete,0);
    assert.match(JSON.stringify(await coachingCommand(f.c,{missing:true})),/Scanner retrying after an error/);
    assert.doesNotMatch(JSON.stringify(await coachingCommand(f.c,{missing:true})),/Still scanning history|Not submitted/);
  }finally{f.sqlite.close();}
});

test('scheduled scanner uses edge-supported manual redirects and never forwards its credential',async()=>{
  const original=globalThis.fetch,env={FHQ_ORIGIN:'https://franchisehq.app',COACHING_SCANNER_SECRET:'ab'.repeat(32)};
  try{
    let calls=0;
    globalThis.fetch=async(url,options)=>{
      calls++;
      if(options.redirect==='error')throw new TypeError('Invalid redirect value in Workers');
      assert.equal(url,'https://franchisehq.app/api/internal/coaching-scan');
      assert.equal(options.redirect,'manual');assert.equal(options.headers['x-fhq-coaching-scanner'],env.COACHING_SCANNER_SECRET);
      return Response.json(calls===1?{ok:true,processed:true}:{ok:true,idle:true});
    };
    await scannerWorker.scheduled({},env);assert.equal(calls,2);
    for(const status of[301,302,307,308,401,500]){
      calls=0;globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options.redirect,'manual');return new Response(null,{status,headers:{location:'https://untrusted.invalid/'}});};
      await assert.rejects(scannerWorker.scheduled({},env),new RegExp(`HTTP ${status}`));assert.equal(calls,1);
    }
    calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:false,retry:true});};
    await assert.rejects(scannerWorker.scheduled({},env),/could not finish/);assert.equal(calls,1);
    calls=0;globalThis.fetch=async()=>{calls++;return Response.json({ok:true,processed:true});};
    await scannerWorker.scheduled({},env);assert.equal(calls,8);
  }finally{globalThis.fetch=original;}
});

test('coach status distinguishes a never-started or stalled scanner, queued checks and completed history',async()=>{
  const f=await fixture();try{
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:[]},{fetchImpl:f.fetchImpl});
    f.sqlite.exec("UPDATE discord_coaching_settings SET updated_at='2026-09-29 20:57:07'");
    let result=JSON.stringify(await coachingCommand(f.c,{now:Date.parse('2026-09-29T22:10:00Z')}));
    assert.match(result,/Scanner stalled/);assert.match(result,/0 submissions found/);assert.doesNotMatch(result,/Still scanning history|Not submitted/);
    result=JSON.stringify(await coachingCommand(f.c,{now:Date.parse('2026-09-29T20:58:00Z')}));
    assert.match(result,/Scanning earlier messages/);assert.match(result,/Still scanning history/);
    await scanCoaching(f.env,f.db,{fetchImpl:f.fetchImpl});
    result=JSON.stringify(await coachingCommand(f.c));assert.match(result,/History scan complete/);assert.match(result,/1 submissions found · 1 checked · 0 awaiting checks/);
    f.sqlite.exec("UPDATE discord_coaching_submissions SET status='pending'");
    result=JSON.stringify(await coachingCommand(f.c));assert.match(result,/History read; screenshot checks are still running/);assert.match(result,/1 awaiting checks/);
    f.sqlite.exec("UPDATE discord_coaching_settings SET updated_at='2026-09-29 20:57:07',last_scan_at='2026-09-29 21:00:00'");
    result=JSON.stringify(await coachingCommand(f.c,{now:Date.parse('2026-09-29T22:10:00Z')}));assert.match(result,/Scanner stalled/);
  }finally{f.sqlite.close();}
});

test('transient AI errors retry and deleted report messages do not corrupt a known archetype',async()=>{
  const f=await fixture();try{
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:[]},{fetchImpl:f.fetchImpl});
    const ai=f.env.AI.run;f.env.AI.run=async()=>{throw new Error('Temporary provider outage');};
    assert.equal((await scanCoaching(f.env,f.db,{fetchImpl:f.fetchImpl})).ok,false);
    assert.equal(f.sqlite.prepare('SELECT status FROM discord_coaching_submissions').get().status,'pending');assert.equal(f.posts.length,0);
    f.env.AI.run=ai;f.sqlite.exec("UPDATE discord_coaching_settings SET next_scan_at=CURRENT_TIMESTAMP");
    await scanCoaching(f.env,f.db,{fetchImpl:f.fetchImpl});
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:['offensive']},{fetchImpl:f.fetchImpl});
    const fetchImpl=async(url,options)=>options?.method==='PATCH'?Response.json({message:'Unknown Message'},{status:404}):f.fetchImpl(url,options);
    assert.equal((await scanCoaching(f.env,f.db,{fetchImpl})).ok,true);
    assert.equal(f.sqlite.prepare('SELECT status FROM discord_coaching_submissions').get().status,'illegal');assert.equal(f.aiCalls(),1);
  }finally{f.sqlite.close();}
});

test('scanner rejects missing or wrong secrets before database access and honors disable during inference',async()=>{
  const f=await fixture();try{
    for(const secret of ['', 'cd'.repeat(32)]){
      const response=await scannerPost({env:f.env,request:new Request('https://example.invalid/api/internal/coaching-scan',{method:'POST',headers:{'x-fhq-coaching-scanner':secret}})});
      assert.equal(response.status,404);
    }
    await configureCoaching(f.c,{enabled:true,sourceChannelId:source,reportChannelId:report,banned:[]},{fetchImpl:f.fetchImpl});
    const ai=f.env.AI.run;f.env.AI.run=async(...args)=>{await configureCoaching(f.c,{enabled:false},{fetchImpl:f.fetchImpl});return ai(...args);};
    assert.equal((await scanCoaching(f.env,f.db,{fetchImpl:f.fetchImpl})).ok,true);assert.equal(f.posts.length,0);
    const response=await scannerPost({env:{...f.env,DB:f.db},request:new Request('https://example.invalid/api/internal/coaching-scan',{method:'POST',headers:{'x-fhq-coaching-scanner':f.env.COACHING_SCANNER_SECRET}})});
    assert.equal(response.status,200);assert.equal((await response.json()).idle,true);
  }finally{f.sqlite.close();}
});

test('EA reconnect reuses only the exact prepared franchise season schedule',async()=>{
  const f=await fixture();try{
    f.sqlite.exec(`INSERT INTO league_game_years(id,league_id,game_release,edition_year,display_name,status) VALUES('year','a','Madden NFL 27',27,'Madden','active');
      INSERT INTO franchise_seasons(id,league_id,source_system,source_franchise_id,source_season_id,game_release,display_name,status) VALUES('season','a','ea-madden-companion','franchise','1','Madden NFL 27','Season','active');
      INSERT INTO game_year_franchise_seasons(game_year_id,league_id,franchise_season_id) VALUES('year','a','season');
      INSERT INTO yearly_schedule_imports(id,league_id,game_year_id,franchise_season_id,status,captured_week_count,game_count,started_by_user_id) VALUES('schedule','a','year','season','completed',18,272,'owner');`);
    const connection={status:'connected',preview_verified:0,external_league_id:'franchise'};
    assert.equal(await eaWeeklyReady(f.db,'a',connection),true);
    assert.equal(await eaWeeklyReady(f.db,'b',connection),false);
    assert.equal(await eaWeeklyReady(f.db,'a',{...connection,external_league_id:'different'}),false);
    f.sqlite.exec("UPDATE franchise_seasons SET status='closed'");
    assert.equal(await eaWeeklyReady(f.db,'a',connection),false);
  }finally{f.sqlite.close();}
});

test('a complete previous/current Companion pair retains the empty new week without advancing All Weeks to future placeholders',()=>{
  const analyses=[];const add=(week,count)=>{
    const period={stage:'regular-season',week,key:`regular-season:${week}`,playable:true};
    analyses.push({datasetType:'schedule',period});
    for(const category of ['passing','rushing','receiving','defense','kicking','punting'])analyses.push({datasetType:'statistics',period,recordCount:count,routePath:`xbsx/1/week/reg/${week}/${category}`});
  };
  add(9,10);add(10,0);
  assert.equal(proveCurrentSchedulePeriod(analyses).period.week,10);
  add(11,0);add(12,0);
  assert.equal(proveCurrentSchedulePeriod(analyses).period.week,9);
});
