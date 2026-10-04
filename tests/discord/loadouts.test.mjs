import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { ROOT, walkFiles } from '../../tools/lib/project.mjs';
import { configureLoadouts, scanLoadouts as runScanLoadouts, loadoutCommand, loadoutSettings,handleLoadoutEvent } from '../../functions/_lib/discord-loadouts.js';
import { normalizeLoadout, evaluateLoadout } from '../../functions/_lib/loadout-rules.js';
import { readLoadoutScreenshot, LOADOUT_READER_VERSION } from '../../functions/_lib/loadout-images.js';
import { LOADOUT_CATALOG } from '../../functions/_lib/loadout-catalog.js';
import {normalizePlaysheets,playsheetId,PLAYSHEET_CATALOG} from '../../functions/_lib/playsheet-catalog.js';
import {loadoutReportLines} from '../../functions/_lib/loadout-report.js';
import {onRequestPost as eventEndpoint} from '../../functions/api/internal/loadout-event.js';
// Scanner tests isolate Discord/tenant state; pixel/model acceptance is in loadout-reader tests.
const scanLoadouts=(env,db,options)=>runScanLoadouts(env,db,{...options,readScreenshot:options?.readScreenshot||(async()=>normalizeLoadout(JSON.parse((await env.AI.run()).response)))});
function d1(sqlite){return {prepare(sql){const s=sqlite.prepare(sql);let args=[];const p={bind(...a){args=a;return p;},async first(){return s.get(...args)||null;},async all(){return {results:s.all(...args)};},async run(){return {meta:{changes:Number(s.run(...args).changes)}};}};return p;}};}
const guild='200000000000000001',parent='200000000000000002',channel='200000000000000003',author='200000000000000004',bot='200000000000000005',messageId='200000000000000006';
const photo='https://cdn.discordapp.com/attachments/123/456/loadout.png';
const sample=(ids=['field-general','camp-counselor'])=>({kind:'loadout',complete:true,slots:Array.from({length:6},(_,i)=>({slot:i+1,state:i<ids.length?'equipped':'locked',clear:true,candidates:i<ids.length?[ids[i]]:[]})),playsheets:{complete:true,slots:Array.from({length:4},(_,i)=>({slot:i+1,state:i===0?'equipped':'locked',clear:true,name:i===0?'Dollar Playsheet':null}))}});
const event={guildId:guild,channelId:channel,messageId};
const readSample=async()=>({...normalizeLoadout(sample()),readerVersion:LOADOUT_READER_VERSION});

test('playsheet names are exact, catalog IDs unique, and unknown or incomplete names never pass',()=>{
  assert.equal(new Set(PLAYSHEET_CATALOG.playsheets.map(s=>s.id)).size,67);
  assert.equal(playsheetId('Heavy 1 Playsheet'),'heavy-i');
  assert.notEqual(playsheetId('Run N Shoot'),playsheetId('Run N Shoot Gun'));
  assert.equal(playsheetId('Dollar Plus'),null);
  const raw=sample();raw.playsheets.slots[0].name='Dollar Plus';
  assert.equal(normalizePlaysheets(raw.playsheets).complete,false);
  assert.equal(evaluateLoadout(normalizeLoadout(raw),{requirePlaysheets:true}).status,'unreadable');
  const partial=sample();partial.playsheets.slots.pop();
  assert.equal(evaluateLoadout(normalizeLoadout(partial),{requirePlaysheets:true}).status,'unreadable');
});

test('playsheet bans and staff duplicates produce the correct per-slot custom marks',()=>{
  const observed=normalizeLoadout(sample(['field-general','field-general']));
  const result=evaluateLoadout(observed,{banDuplicates:true,bannedPlaysheets:['dollar'],requirePlaysheets:true});
  assert.equal(result.status,'illegal');assert.equal(result.duplicateCheck,'illegal');
  assert.equal(result.slotResults[0].status,'illegal');assert.equal(result.slotResults[1].status,'illegal');
  assert.equal(result.playsheetResults[0].status,'illegal');
  const report=loadoutReportLines(observed,result,{LOADOUT_PASS_EMOJI_ID:'100000000000000001',LOADOUT_FAIL_EMOJI_ID:'100000000000000002'});
  assert.match(report,/<:fhq_fail:100000000000000002> Slot 1/);assert.doesNotMatch(report,/✅|🟢/);
  const raw=sample(['field-general']);raw.playsheets.slots[1]={...raw.playsheets.slots[0],slot:2};
  assert.equal(evaluateLoadout(normalizeLoadout(raw),{banDuplicates:true,requirePlaysheets:true}).status,'legal');
});

test('playsheet settings retain league scope, preserve older-client writes and reject invented bans',async()=>{
  const f=await fixture();try{
    await f.save({bannedPlaysheets:['dollar']});await f.save({banned:[]});
    assert.deepEqual((await loadoutSettings(f.db,'a',f.env)).bannedPlaysheets,['dollar']);
    assert.deepEqual((await loadoutSettings(f.db,'b',f.env)).bannedPlaysheets,[]);
    await assert.rejects(f.save({bannedPlaysheets:['made-up']}),/current catalog/);
  }finally{f.sqlite.close();}
});

test('live events bypass history leases, use canonical authors and deduplicate completed checks',async()=>{
  const f=await fixture();try{
    await f.save();f.sqlite.exec("UPDATE discord_loadout_settings SET lease_token='history',lease_until=datetime('now','+4 minutes')");
    let reads=0;const options={fetchImpl:f.fetchImpl,readScreenshot:async()=>{reads++;return readSample();}};
    assert.equal((await handleLoadoutEvent(f.env,f.db,event,options)).processed,true);
    await handleLoadoutEvent(f.env,f.db,event,options);
    assert.equal(reads,1);assert.equal(f.posts.length,1);
    assert.equal(f.calls.filter(c=>c.path.endsWith('/messages/'+messageId)).length,2);
    const row=f.sqlite.prepare('SELECT * FROM discord_loadout_submissions').get();
    assert.equal(row.author_id,author);assert.ok(row.reported_at);assert.ok(JSON.parse(row.timings_json).processingMs>=0);
    await handleLoadoutEvent(f.env,f.db,{...event,channelId:parent},options);assert.equal(reads,1);
  }finally{f.sqlite.close();}
});

test('an edit during an in-flight check invalidates the old verdict and retries once with the new evidence',async()=>{
  const f=await fixture();try{
    await f.save();let unblock,reading;const started=new Promise(r=>{reading=r;});
    const first=handleLoadoutEvent(f.env,f.db,event,{fetchImpl:f.fetchImpl,readScreenshot:async()=>{reading();await new Promise(r=>{unblock=r;});return readSample();}});
    await started;f.message.edited_timestamp='2026-10-04T08:00:00Z';
    const busy=await handleLoadoutEvent(f.env,f.db,event,{fetchImpl:f.fetchImpl,readScreenshot:readSample});
    assert.equal(busy.busy,true);unblock();await first;assert.equal(f.posts.length,0);
    await handleLoadoutEvent(f.env,f.db,event,{fetchImpl:f.fetchImpl,readScreenshot:readSample});
    assert.equal(f.posts.length,1);assert.equal(f.sqlite.prepare('SELECT processing_token FROM discord_loadout_submissions').get().processing_token,null);
  }finally{f.sqlite.close();}
});

test('event endpoint hides unauthenticated access and bounds event bodies',async()=>{
  const secret='ab'.repeat(32),env={COACHING_SCANNER_SECRET:secret};
  assert.equal((await eventEndpoint({env,request:new Request('https://test/api/internal/loadout-event',{method:'POST',body:'{}'})})).status,404);
  assert.equal((await eventEndpoint({env,request:new Request('https://test/api/internal/loadout-event',{method:'POST',headers:{'x-fhq-coaching-scanner':secret},body:'x'.repeat(1025)})})).status,413);
});
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of (await walkFiles()).filter(f=>/^migrations\/\d+_.*\.sql$/.test(f)).sort())sqlite.exec(await readFile(`${ROOT}/${file}`,'utf8'));
  sqlite.exec(`INSERT INTO leagues(id,name,slug,tenant_status) VALUES('a','Alpha','alpha','enabled'),('b','Beta','beta','enabled');
    INSERT INTO users(id,discord_user_id,discord_username,display_name) VALUES('owner','${author}','owner','Owner');
    INSERT INTO league_memberships(id,league_id,user_id,team_id,role,active) VALUES('member','a','owner','tb','commissioner',1);
    INSERT INTO discord_league_installations(id,league_id,discord_guild_id,application_id,status,schedule_channel_id) VALUES('install','a','${guild}','${bot}','active','${parent}');
    INSERT INTO league_snapshots(id,league_id,status,season_year,week_index,manifest_json) VALUES('snapshot','a','active',2027,10,'{}');
    INSERT INTO league_active_snapshots(league_id,snapshot_id) VALUES('a','snapshot');
    INSERT INTO discord_schedule_sync_runs(id,league_id,snapshot_id,discord_guild_id,schedule_channel_id,season_year,week_index,source) VALUES('sync','a','snapshot','${guild}','${parent}',2027,10,'discord-command');
    INSERT INTO discord_schedule_threads(id,league_id,snapshot_id,sync_run_id,discord_guild_id,parent_channel_id,discord_thread_id,game_external_id,season_year,week_index,home_team_key,away_team_key,status)
    VALUES('thread','a','snapshot','sync','${guild}','${parent}','${channel}','game',2027,10,'tb','mia','active');`);
  for(const [key,abbr,name] of [['tb','TB','Buccaneers'],['mia','MIA','Dolphins']])sqlite.prepare("INSERT INTO league_snapshot_records(snapshot_id,league_id,domain,external_id,data_json) VALUES('snapshot','a','teams',?,?)")
    .run(key,JSON.stringify({external_id:key,abbreviation:abbr,display_name:name,team_name:name}));
  let aiCalls=0;
  const calls=[],posts=[],message={id:messageId,author:{id:author},timestamp:'2026-09-28T00:00:00Z',attachments:[{url:photo,content_type:'image/png'}]};
  const env={DISCORD_BOT_TOKEN:'test-only',COACHING_SCANNER_SECRET:'ab'.repeat(32),LOADOUT_READER_VERSION,
    AI:{run:async()=>{aiCalls++;return {response:JSON.stringify(sample())};}}};
  const fetchImpl=async(url,options={})=>{
    const u=new URL(url),method=options.method||'GET';calls.push({path:u.pathname,method,query:u.search});
    if(u.hostname==='franchisehq.app')return new Response(await readFile(`${ROOT}${u.pathname}`),{headers:{'content-type':'image/png'}});
    if(u.hostname==='cdn.discordapp.com')return new Response(new Uint8Array([137,80,78,71,1,2,3]),{headers:{'content-type':'image/png'}});
    if(u.pathname.endsWith('/applications/@me'))return Response.json({flags:1<<18});
    if(u.pathname.endsWith(['','users','@me'].join('/')))return Response.json({id:bot});
    if(u.pathname.endsWith(`/members/${bot}`))return Response.json({roles:[]});
    if(u.pathname.endsWith('/roles'))return Response.json([{id:guild,permissions:String((1n<<10n)|(1n<<16n)|(1n<<14n)|(1n<<38n))}]);
    if(u.pathname===`/api/v10/channels/${parent}`)return Response.json({id:parent,guild_id:guild,type:0});
    if(u.pathname===`/api/v10/channels/${channel}`)return Response.json({id:channel,parent_id:parent,guild_id:guild,type:11});
    if(u.pathname===`/api/v10/channels/${channel}/messages/${messageId}`&&method==='GET')return Response.json(message);
    if(u.pathname===`/api/v10/channels/${channel}/messages`&&method==='GET')return Response.json(u.searchParams.has('after')?[]:[message,...posts.map(p=>({id:'200000000000000009',author:{id:bot,bot:true},...p}))]);
    if(u.pathname.startsWith(`/api/v10/channels/${channel}/messages`)&&['POST','PATCH'].includes(method)){
      posts.push(JSON.parse(options.body));return Response.json({id:'200000000000000009'});
    }
    throw new Error(`Unexpected fixture path ${method} ${u.pathname}`);
  };
  const db=d1(sqlite),c={db,env,league:{id:'a',slug:'alpha'}};
  const save=async(overrides={})=>configureLoadouts(c,{enabled:true,banned:['camp-counselor'],banDuplicates:true,
    revision:sqlite.prepare('SELECT revision FROM discord_loadout_settings').get()?.revision||0,catalogVersion:LOADOUT_CATALOG.version,...overrides},{fetchImpl});
  return {sqlite,db,c,env,fetchImpl,calls,posts,message,save,aiCalls:()=>aiCalls};
}

test('all catalog entries have tiers, icons and position groups; development and scouting use the same grouping',async()=>{
  assert.deepEqual(JSON.parse(await readFile(`${ROOT}/assets/abilities/catalog.json`,'utf8')),LOADOUT_CATALOG);
  assert.equal(new Set(LOADOUT_CATALOG.abilities.map(a=>a.id)).size,78);
  for(const a of LOADOUT_CATALOG.abilities){assert.equal(a.effects.length,4);assert.ok(a.positionGroups.length);assert.ok((await readFile(`${ROOT}${a.icon}`)).length);}
  assert.ok(LOADOUT_CATALOG.abilities.find(a=>a.id==='practician-dl').positionGroups.includes('DT'));
  assert.ok(LOADOUT_CATALOG.abilities.find(a=>a.id==='rb-reconnaissance').positionGroups.includes('RB/FB'));
});

test('rule decisions never treat shared glyphs, partial slots or invented abilities as proven legal or duplicate',()=>{
  for(const value of [{}, {...sample(),complete:false}, {...sample(),slots:sample().slots.slice(1)}, sample(['made-up'])])assert.equal(evaluateLoadout(normalizeLoadout(value),{}).status,'unreadable');
  const shared=normalizeLoadout(sample(['trimmed-edges','all-hustle']));
  assert.equal(evaluateLoadout(shared,{banDuplicates:true}).status,'unreadable');
  assert.equal(evaluateLoadout(shared,{banned:['all-hustle']}).status,'unreadable');
  assert.equal(evaluateLoadout(shared,{banned:['all-hustle','trimmed-edges']}).status,'illegal');
  assert.equal(evaluateLoadout(normalizeLoadout(sample(['camp-counselor','camp-counselor'])),{banDuplicates:true}).status,'illegal');
  assert.equal(evaluateLoadout(normalizeLoadout(sample(['camp-counselor','camp-counselor'])),{}).status,'legal');
  const detail=sample(['trimmed-edges','all-hustle']);
  detail.slots.forEach((s,i)=>{if(i<2)Object.assign(s,{writtenAbilityId:s.candidates[0],writtenName:i?'All Hustle':'Trimmed Edges',detailLinkedToSlot:true});});
  assert.equal(evaluateLoadout(normalizeLoadout(detail),{banDuplicates:true}).status,'legal');
});

test('league settings preserve opt-in, reject unknown bans and stale writes, and enforce model activation',async()=>{
  const f=await fixture();try{
    delete f.env.LOADOUT_READER_VERSION;
    await assert.rejects(f.save(),/awaiting platform activation/);
    await f.save({enabled:false});
    assert.equal((await loadoutSettings(f.db,'a',f.env)).enabled,false);
    await assert.rejects(f.save({enabled:false,banned:['made-up']}),/current catalog/);
    await assert.rejects(f.save({enabled:false,revision:0}),/Another commissioner/);
    assert.equal((await loadoutSettings(f.db,'b',f.env)).banned.length,0);
  }finally{f.sqlite.close();}
});

test('history backfill maps the Discord author, posts in their matchup, and edits the report when rules change',async()=>{
  const f=await fixture();try{
    await f.save();assert.equal((await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl})).ok,true);
    const result=f.sqlite.prepare('SELECT * FROM discord_loadout_submissions').get();
    assert.equal(result.status,'illegal');assert.equal(result.team_key,'tb');assert.equal(result.author_id,author);
    assert.equal(f.posts.length,1);assert.match(f.posts[0].content,/Camp Counselor is banned/);assert.deepEqual(f.posts[0].allowed_mentions,{parse:[]});
    await f.save({banned:[]});await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});
    assert.equal(f.sqlite.prepare('SELECT status FROM discord_loadout_submissions').get().status,'legal');
    assert.equal(f.aiCalls(),1);assert.equal(f.posts.length,2);assert.equal(f.calls.at(-1).method,'PATCH');
    assert.equal(f.sqlite.prepare("SELECT count(*) n FROM discord_loadout_submissions WHERE league_id='b'").get().n,0);
    await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});assert.equal(f.posts.length,2);
  }finally{f.sqlite.close();}
});

test('disable or week advance during image reading prevents old-week reports',async()=>{
  for(const change of ['disable','advance']){
    const f=await fixture();try{
      await f.save();f.env.AI.run=async()=>{
        if(change==='disable')await f.save({enabled:false});else f.sqlite.exec('UPDATE league_snapshots SET week_index=11');
        return {response:JSON.stringify(sample())};
      };
      assert.equal((await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl})).ok,true);assert.equal(f.posts.length,0);
    }finally{f.sqlite.close();}
  }
});

test('a reader upgrade rechecks an existing current-week submission and edits its existing report once',async()=>{
 const f=await fixture();try{
  await f.save();await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});
  const old={...normalizeLoadout(sample(['camp-counselor'])),readerVersion:'old-reader'};
  f.sqlite.prepare('UPDATE discord_loadout_submissions SET observed_json=?,status=?').run(JSON.stringify(old),'unreadable');
  const {LOADOUT_READER_VERSION}=await import('../../functions/_lib/loadout-images.js');
  let reads=0;const readScreenshot=async()=>{reads++;return {...normalizeLoadout(sample(['field-general'])),readerVersion:LOADOUT_READER_VERSION};};
  await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl,readScreenshot});
  assert.equal(reads,1);assert.equal(f.sqlite.prepare('SELECT status FROM discord_loadout_submissions').get().status,'legal');
  assert.equal(f.calls.at(-1).method,'PATCH');assert.equal(f.posts.length,2);
  await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl,readScreenshot});assert.equal(reads,1);assert.equal(f.posts.length,2);
 }finally{f.sqlite.close();}
});

test('transient image errors retry without a verdict; unclear evidence requests resubmission',async()=>{
  const f=await fixture();try{
    await f.save();f.env.AI.run=async()=>{throw new Error('temporary');};
    assert.equal((await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl})).retry,true);assert.equal(f.posts.length,0);
    assert.equal(f.sqlite.prepare('SELECT status FROM discord_loadout_submissions').get().status,'pending');
    f.sqlite.exec("UPDATE discord_loadout_settings SET next_scan_at=datetime('now','-1 minute')");
    f.env.AI.run=async()=>({response:JSON.stringify({kind:'uncertain',complete:false})});
    await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});assert.match(f.posts[0].content,/Clearer evidence needed/);
    assert.equal(f.sqlite.prepare('SELECT status FROM discord_loadout_submissions').get().status,'unreadable');
  }finally{f.sqlite.close();}
});

test('permanently invalid old-reader evidence is not rechecked forever after an upgrade',async()=>{
 const f=await fixture();try{
  await f.save();await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});
  f.sqlite.prepare('UPDATE discord_loadout_submissions SET observed_json=?').run(JSON.stringify({kind:'uncertain',readerVersion:'old-reader'}));
  let reads=0;const readScreenshot=async()=>{reads++;throw Object.assign(new Error('Unsupported image'),{retryable:false});};
  await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl,readScreenshot});
  await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl,readScreenshot});
  assert.equal(reads,1);assert.equal(f.sqlite.prepare('SELECT status FROM discord_loadout_submissions').get().status,'unreadable');
 }finally{f.sqlite.close();}
});

test('unrelated screenshots produce no bot verdict and another team cannot submit for this matchup',async()=>{
  const f=await fixture();try{
    await f.save();f.env.AI.run=async()=>({response:JSON.stringify({kind:'other'})});
    await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});assert.equal(f.posts.length,0);
    assert.equal(f.sqlite.prepare('SELECT status FROM discord_loadout_submissions').get().status,'ignored');
    f.sqlite.exec("DELETE FROM discord_loadout_submissions; UPDATE discord_loadout_threads SET live_after=NULL; UPDATE league_memberships SET active=0");
    f.env.AI.run=async()=>({response:JSON.stringify(sample())});
    await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});assert.match(f.posts[0].content,/Team link needed/);
  }finally{f.sqlite.close();}
});

test('missing command distinguishes incomplete history, pending checks and genuine missing submissions',async()=>{
  const f=await fixture();try{
    await f.save();assert.match(JSON.stringify(await loadoutCommand(f.c,{missing:true})),/missing status not yet confirmed/);
    const empty=async(url,options)=>String(url).includes(`/channels/${channel}/messages?`)?Response.json([]):f.fetchImpl(url,options);
    await scanLoadouts(f.env,f.db,{fetchImpl:empty});assert.match(JSON.stringify(await loadoutCommand(f.c,{missing:true})),/Not submitted/);
    f.sqlite.exec("UPDATE discord_loadout_threads SET last_scan_at=datetime('now','-20 minutes')");
    assert.doesNotMatch(JSON.stringify(await loadoutCommand(f.c,{missing:true})),/Not submitted/);
  }finally{f.sqlite.close();}
});

test('unsafe image redirects and missing thread permissions never enable a false check',async()=>{
  const f=await fixture();try{
    await assert.rejects(readLoadoutScreenshot(f.env,[photo],{fetchImpl:async()=>new Response(null,{status:302,headers:{location:'https://127.0.0.1/private.png'}})}),/cannot be read/);
    const deny=async(url,options)=>String(url).endsWith('/roles')?Response.json([{id:guild,permissions:'0'}]):f.fetchImpl(url,options);
    await assert.rejects(configureLoadouts(f.c,{enabled:true,banned:[],banDuplicates:false,revision:0,catalogVersion:LOADOUT_CATALOG.version},{fetchImpl:deny}),/Send Messages in Threads/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM discord_loadout_settings').get().n,0);
  }finally{f.sqlite.close();}
});

test('history and live pagination retain every submission beyond Discord’s 100-message page',async()=>{
  const f=await fixture();try{
    await f.save();f.env.AI.run=async()=>({response:JSON.stringify({kind:'other'})});
    let messages=Array.from({length:201},(_,i)=>({...f.message,id:String(600000000000000000n+BigInt(i))}));
    const paged=async(url,options={})=>{
      const u=new URL(url);
      if(u.pathname===`/api/v10/channels/${channel}/messages`){
        const before=u.searchParams.get('before'),after=u.searchParams.get('after');
        return Response.json(messages.filter(m=>(!before||BigInt(m.id)<BigInt(before))&&(!after||BigInt(m.id)>BigInt(after))).slice(-100).reverse());
      }
      const id=u.pathname.split('/').at(-1),message=messages.find(m=>m.id===id);
      if(message)return Response.json(message);
      return f.fetchImpl(url,options);
    };
    for(let i=0;i<3;i++)assert.equal((await scanLoadouts(f.env,f.db,{fetchImpl:paged})).ok,true);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM discord_loadout_submissions').get().n,201);
    assert.equal(f.sqlite.prepare('SELECT history_complete n FROM discord_loadout_threads').get().n,1);
    messages.push(...Array.from({length:151},(_,i)=>({...f.message,id:String(600000000000000201n+BigInt(i))})));
    for(let i=0;i<2;i++)assert.equal((await scanLoadouts(f.env,f.db,{fetchImpl:paged})).ok,true);
    assert.equal(f.sqlite.prepare('SELECT count(*) n FROM discord_loadout_submissions').get().n,352);
    assert.equal(f.posts.length,0);
  }finally{f.sqlite.close();}
});

test('a newer pending submission replaces an older legal status in commissioner reports',async()=>{
  const f=await fixture();try{
    await f.save({banned:[]});await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});
    f.sqlite.prepare(`INSERT INTO discord_loadout_submissions(league_id,thread_id,message_id,author_id,submitted_at)
      VALUES('a','thread','200000000000000099',?,'2026-09-29T00:00:00Z')`).run(author);
    const report=await loadoutCommand(f.c,{missing:true});
    assert.match(JSON.stringify(report),/Checking screenshot/);
  }finally{f.sqlite.close();}
});

test('two leagues sharing an owner retain different bans and deliver only to their own tracked threads',async()=>{
  const f=await fixture();try{
    await f.save();await scanLoadouts(f.env,f.db,{fetchImpl:f.fetchImpl});
    const otherGuild='300000000000000001',otherParent='300000000000000002',otherChannel='300000000000000003';
    f.posts.length=0; // The second Discord thread has its own message history.
    f.sqlite.exec(`UPDATE discord_loadout_settings SET next_scan_at=datetime('now','+1 hour');
      INSERT INTO league_memberships(id,league_id,user_id,team_id,role,active) VALUES('member-b','b','owner','tb','commissioner',1);
      INSERT INTO discord_league_installations(id,league_id,discord_guild_id,application_id,status,schedule_channel_id) VALUES('install-b','b','${otherGuild}','${bot}','active','${otherParent}');
      INSERT INTO league_snapshots(id,league_id,status,season_year,week_index,manifest_json) VALUES('snapshot-b','b','active',2027,10,'{}');
      INSERT INTO league_active_snapshots(league_id,snapshot_id) VALUES('b','snapshot-b');
      INSERT INTO league_snapshot_records(snapshot_id,league_id,domain,external_id,data_json) SELECT 'snapshot-b','b',domain,external_id,data_json FROM league_snapshot_records WHERE league_id='a';
      INSERT INTO discord_schedule_sync_runs(id,league_id,snapshot_id,discord_guild_id,schedule_channel_id,season_year,week_index,source) VALUES('sync-b','b','snapshot-b','${otherGuild}','${otherParent}',2027,10,'discord-command');
      INSERT INTO discord_schedule_threads(id,league_id,snapshot_id,sync_run_id,discord_guild_id,parent_channel_id,discord_thread_id,game_external_id,season_year,week_index,home_team_key,away_team_key,status)
      VALUES('thread-b','b','snapshot-b','sync-b','${otherGuild}','${otherParent}','${otherChannel}','game',2027,10,'tb','mia','active');`);
    const requests=[];
    const transport=async(url,options)=>{
      requests.push(String(url));let target=String(url).replaceAll(otherGuild,guild).replaceAll(otherParent,parent).replaceAll(otherChannel,channel);
      const response=await f.fetchImpl(target,options);
      if(response.headers.get('content-type')?.includes('application/json')){
        const text=await response.text();return new Response(text.replaceAll(guild,otherGuild).replaceAll(parent,otherParent).replaceAll(channel,otherChannel),{status:response.status,headers:response.headers});
      }
      return response;
    };
    await configureLoadouts({...f.c,league:{id:'b',slug:'beta'}},{enabled:true,banned:[],banDuplicates:false,revision:0,catalogVersion:LOADOUT_CATALOG.version},{fetchImpl:transport});
    assert.equal((await scanLoadouts(f.env,f.db,{fetchImpl:transport})).ok,true);
    assert.equal(f.sqlite.prepare("SELECT status FROM discord_loadout_submissions WHERE league_id='a'").get().status,'illegal');
    assert.equal(f.sqlite.prepare("SELECT status FROM discord_loadout_submissions WHERE league_id='b'").get().status,'legal');
    assert.ok(requests.some(url=>url.endsWith(`/channels/${otherChannel}/messages`)));
    assert.ok(requests.every(url=>!url.includes(`/channels/${channel}`)));
    assert.match(f.posts.at(-1).content,/Legal/);
  }finally{f.sqlite.close();}
});
