import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {discordBotRequest} from '../../functions/_lib/discord-api.js';
import {discordPacedFetch} from '../../functions/_lib/discord-pacing.js';

const code=(await readFile(new URL('../../workers/franchise-import-worker/src/discord-pacing.js',import.meta.url),'utf8'))
  .replace("import { DurableObject } from 'cloudflare:workers';",'class DurableObject { constructor(ctx){this.ctx=ctx;} }')
  .replaceAll('export ','');
const context=vm.createContext({Date});
vm.runInContext(`${code}\nglobalThis.update=updatePacing;globalThis.Coordinator=DiscordPacing;`,context);
const update=context.update;
const input={route:'channels:1:POST:messages',major:'channels:1',owner:'request-a'};

test('429 retry_after takes precedence over a much later bucket reset',async()=>{
  let attempts=0;
  await assert.rejects(discordBotRequest({DISCORD_BOT_TOKEN:'fixture'},'/channels/1/messages',{
    rateLimitRetries:0,fetchImpl:async()=>{
      attempts++;return Response.json({retry_after:1.25},{status:429,
        headers:{'retry-after':'2','x-ratelimit-reset-after':'290'}});
    }
  }),error=>error.retryAfterSeconds===1.25);
  assert.equal(attempts,1);
});

test('bucket cooldown survives reconstruction and does not block another channel',()=>{
  let state={};
  assert.equal(update(state,{...input,action:'reserve'},0).granted,true);
  update(state,{...input,action:'observe',status:429,bucket:'thread-create',retryAfterSeconds:290},0);
  state=JSON.parse(JSON.stringify(state));
  assert.equal(update(state,{...input,action:'reserve'},1000).granted,false);
  assert.equal(update(state,{...input,route:'channels:2:POST:messages',major:'channels:2',action:'reserve'},1000).granted,true);
  assert.equal(update(state,{...input,action:'reserve'},290026).granted,true);
});

test('global rejection pauses all routes for that credential but not a separate bot',()=>{
  const state={};
  update(state,{...input,action:'reserve'},0);
  update(state,{...input,action:'observe',status:429,global:true,retryAfterSeconds:7},0);
  const other={...input,route:'channels:2:GET:messages',action:'reserve'};
  assert.equal(update(state,other,1000).scope,'global');
  assert.equal(update({},other,1000).granted,true);
});

test('interrupted reservations expire; stale responses cannot release a newer request',()=>{
  const state={};
  update(state,{...input,action:'reserve'},0);
  assert.equal(update(state,{...input,owner:'b',action:'reserve'},1000).granted,false);
  assert.equal(update(state,{...input,owner:'b',action:'reserve'},30001).granted,true);
  assert.equal(update(state,{...input,action:'observe',status:200},30002).stale,true);
  assert.equal(update(state,{...input,owner:'c',action:'reserve'},30003).granted,false);
});

test('league lease prevents concurrent work and is recoverable after interruption',()=>{
  const state={};
  assert.equal(update(state,{...input,action:'lock'},0).granted,true);
  assert.equal(update(state,{...input,owner:'b',action:'lock'},1).granted,false);
  update(state,{...input,owner:'b',action:'unlock'},2);
  assert.equal(update(state,{...input,owner:'b',action:'lock'},3).granted,false);
  assert.equal(update(state,{...input,owner:'b',action:'lock'},180001).granted,true);
});

test('SQLite coordinator persists independent records and resumes after object eviction',async()=>{
  const db=new DatabaseSync(':memory:');
  const ctx={storage:{sql:{exec(sql,...args){const statement=db.prepare(sql);return statement.columns().length?statement.all(...args):statement.run(...args);}},
    transactionSync(fn){db.exec('BEGIN');try{const result=fn();db.exec('COMMIT');return result;}catch(error){db.exec('ROLLBACK');throw error;}}}};
  try{
    const first=new context.Coordinator(ctx,{});
    await first.coordinate({...input,action:'reserve'});
    await first.coordinate({...input,action:'observe',status:429,retryAfterSeconds:90,bucket:'test'});
    const second=new context.Coordinator(ctx,{});
    assert.equal((await second.coordinate({...input,action:'reserve'})).granted,false);
    assert.ok(db.prepare('SELECT COUNT(*) AS n FROM pacing').get().n>1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM pacing WHERE value LIKE '%Authorization%'").get().n,0);
  }finally{db.close();}
});

test('transport never sends credentials or Discord content to coordinator and fails closed',async()=>{
  const metadata=[];let sent=0;
  const env={DISCORD_BOT_TOKEN:'private-token',FRANCHISE_IMPORT_WORKER:{fetch:async(_url,options)=>{
    metadata.push(JSON.parse(options.body));return Response.json(metadata.length===1?{granted:true}:{ok:true});
  }}};
  const transport=discordPacedFetch(env,async()=>{sent++;return Response.json({id:'message'});});
  await transport('https://discord.com/api/v10/channels/123/messages',{method:'POST',
    headers:{Authorization:'Bot private-token'},body:JSON.stringify({content:'private-content'})});
  assert.equal(sent,1);
  assert.equal(JSON.stringify(metadata).includes('private-'),false);
  assert.match(metadata[0].credential,/^[a-f0-9]{64}$/);
  env.FRANCHISE_IMPORT_WORKER.fetch=async()=>Response.json({},{status:503});
  await assert.rejects(transport('https://discord.com/api/v10/channels/123/messages',{}),error=>error.status===503);
  assert.equal(sent,1);
});

for(const count of [5,25,100]){
  test(`${count} concurrent league simulation: finite progress, isolated buckets and restart recovery`,()=>{
    let state={},now=0,completed=0;
    const leagues=Array.from({length:count},(_,index)=>({index,step:0,next:0,created:0,archived:0,members:0}));
    const provider=new Map(),posted=new Set();
    // 16 creates, 16 archives, 64 member additions per league. The simulated
    // provider deliberately permits only ten creates/channel per five minutes.
    while(completed<count&&now<900000){
      for(let offset=0;offset<count;offset++){
        const league=leagues[(offset+Math.floor(now/1000))%count];
        if(league.step===96||league.next>now)continue;
        const lane=league.step<16?'create':league.step<32?'archive':'members';
        const major=`channels:${league.index}`;
        const request={action:'reserve',major,route:`${major}:${lane}`,owner:`${league.index}-${league.step}`};
        const admission=update(state,request,now);
        if(!admission.granted){league.next=now+Math.max(25,admission.retryAfterSeconds*1000);continue;}
        const window=provider.get(major)||{until:now+300000,count:0};
        if(window.until<=now){window.until=now+300000;window.count=0;}
        provider.set(major,window);
        if(lane==='create'&&window.count===10){
          update(state,{...request,action:'observe',bucket:lane,status:429,retryAfterSeconds:(window.until-now)/1000},now);
          league.next=window.until+25;continue;
        }
        update(state,{...request,action:'observe',bucket:lane,status:200},now);
        assert.equal(posted.has(request.owner),false);
        posted.add(request.owner);
        if(lane==='create'){window.count++;league.created++;}
        else if(lane==='archive'){assert.equal(league.created,16);league.archived++;}
        else{assert.equal(league.archived,16);league.members++;}
        league.step++;
        if(league.step===96)completed++;
      }
      now+=25;
      if(now%1000===0)state=JSON.parse(JSON.stringify(state));
    }
    assert.equal(completed,count);
    assert.equal(posted.size,count*96);
    assert.ok(leagues.every(league=>league.created===16&&league.archived===16&&league.members===64));
  });
}
