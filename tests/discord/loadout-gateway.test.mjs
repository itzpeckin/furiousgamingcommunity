import test from 'node:test';
import assert from 'node:assert/strict';
import {GatewayConnection,screenshotEvent} from '../../workers/franchise-coaching-scanner/src/gateway.js';
import scheduled from '../../workers/franchise-coaching-scanner/src/scheduled.js';
import {onRequestPost} from '../../functions/api/internal/loadout-event.js';
const guild='200000000000000001',channel='200000000000000002',id='200000000000000003';
const packet={op:0,s:20,t:'MESSAGE_CREATE',d:{guild_id:guild,channel_id:channel,id,author:{id:'200000000000000004'},attachments:[{content_type:'image/png'}]}};
function fixture(){
 const data=new Map(),pending=[],writes=[];
 const storage={async get(k){return structuredClone(data.get(k));},async put(k,v){writes.push(k);data.set(k,structuredClone(v));},async delete(k){data.delete(k);},async list({prefix,limit}){return new Map([...data].filter(([k])=>k.startsWith(prefix)).slice(0,limit));},async setAlarm(){},async transaction(fn){return fn(storage);}};
 const ctx={storage,waitUntil(p){pending.push(p);}},g=new GatewayConnection(ctx,{LOADOUT_GATEWAY_ENABLED:'true'});
 const ws={readyState:1,sent:[],send(v){this.sent.push(JSON.parse(v));},close(){this.readyState=3;}};
 g.socket=ws;g.routes=new Set([`${guild}:${channel}`]);g.routesAt=Date.now();g.session={id:'session',seq:19,url:'wss://gateway-us-east1-b.discord.gg'};
 return {g,ws,data,writes,pending,async flush(){while(pending.length)await Promise.all(pending.splice(0));}};
}
test('Gateway filters unrelated channels, bots and non-images; partial edits remain eligible',()=>{
 const routes=new Set([`${guild}:${channel}`]);
 assert.equal(screenshotEvent(packet,routes).messageId,id);
 assert.equal(screenshotEvent(packet,new Set()),null);
 assert.equal(screenshotEvent({...packet,d:{...packet.d,author:{bot:true}}},routes),null);
 assert.equal(screenshotEvent({...packet,d:{...packet.d,attachments:[]}},routes),null);
 assert.ok(screenshotEvent({...packet,t:'MESSAGE_UPDATE',d:{id,guild_id:guild,channel_id:channel}},routes));
});
test('Gateway saves a durable event before advancing resume sequence and keeps edits arriving during a check',async()=>{
 const f=fixture();let release;f.g.api=async()=>new Promise(r=>{release=r;});
 await f.g.message(f.ws,JSON.stringify(packet));
 await new Promise(r=>setImmediate(r));
 assert.ok(f.writes.indexOf('job:'+channel+':'+id)<f.writes.indexOf('session'));
 assert.equal(f.data.get('session').seq,20);
 await f.g.message(f.ws,JSON.stringify({...packet,t:'MESSAGE_UPDATE',s:21}));
 release({ok:true});await f.flush();assert.equal([...f.data.keys()].filter(k=>k.startsWith('job:')).length,1);
 f.g.api=async()=>({ok:true});await f.g.drain();await f.flush();assert.equal([...f.data.keys()].filter(k=>k.startsWith('job:')).length,0);
});
test('Gateway failure retains IDs for retry and limits concurrent delivery to four',async()=>{
 const f=fixture();let active=0,max=0;const releases=[];
 f.g.api=async()=>{active++;max=Math.max(max,active);await new Promise(r=>releases.push(r));active--;throw new Error('temporary');};
 for(let n=0;n<7;n++)f.data.set('job:'+n,{event:{messageId:String(BigInt(id)+BigInt(n))},revision:String(n),attempts:0,due:0});
 await f.g.drain();assert.equal(max,4);releases.forEach(r=>r());await f.flush();
 assert.equal(f.data.size,7);assert.equal(f.data.get('job:0').attempts,1);assert.equal(f.g.active.size,0);
});
test('Hello resumes a saved session and heartbeat ACK restores liveness without persisting credentials',async()=>{
 const f=fixture();f.g.botToken='test-only';
 await f.g.message(f.ws,JSON.stringify({op:10,d:{heartbeat_interval:45000}}));clearTimeout(f.g.timer);
 assert.equal(f.ws.sent[0].op,6);assert.equal(f.ws.sent[0].d.seq,19);
 f.g.heartbeat(f.ws);assert.equal(f.g.ack,false);await f.g.message(f.ws,JSON.stringify({op:11}));assert.equal(f.g.ack,true);
 assert.doesNotMatch(JSON.stringify([...f.data]),/test-only/);
});
test('Gateway start failure preserves scheduled recovery scans',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({ok:true,idle:true});};
 try{await scheduled.scheduled({}, {COACHING_SCANNER_SECRET:'ab'.repeat(32),FHQ_ORIGIN:'https://franchisehq.app',LOADOUT_GATEWAY_ENABLED:'true',LOADOUT_GATEWAY:{getByName(){return {async start(){throw new Error('disconnected');}};}}});assert.equal(calls,1);}
 finally{globalThis.fetch=original;}
});
test('private gateway bootstrap requires exact scanner secret, activation, and no-store',async()=>{
 const secret='ab'.repeat(32),env={COACHING_SCANNER_SECRET:secret,DISCORD_BOT_TOKEN:'test-only',LOADOUT_GATEWAY_ENABLED:'true'};
 const request=token=>new Request('https://franchisehq.app/api/internal/loadout-event',{method:'POST',headers:{'x-fhq-coaching-scanner':token},body:JSON.stringify({action:'gateway-credentials'})});
 assert.equal((await onRequestPost({env,request:request('cd'.repeat(32))})).status,404);
 const r=await onRequestPost({env,request:request(secret)});assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).token,'test-only');
 assert.equal((await onRequestPost({env:{...env,LOADOUT_GATEWAY_ENABLED:'false'},request:request(secret)})).status,404);
});
