// One connection coordinator per Discord bot shard. Evidence stays in Discord;
// only eligible thread/message IDs are persisted for durable delivery.
export const snow=value=>/^\d{17,20}$/.test(String(value||''));
export function screenshotEvent(packet,routes){
  if(!['MESSAGE_CREATE','MESSAGE_UPDATE'].includes(packet.t))return null;
  const m=packet.d;
  if(!m||m.author?.bot||![m.id,m.guild_id,m.channel_id].every(snow)||!routes.has(`${m.guild_id}:${m.channel_id}`))return null;
  if(packet.t==='MESSAGE_CREATE'&&!m.attachments?.some(a=>/^image\//.test(a.content_type||''))&&!/https:\/\/(?:www\.)?xbox\.com\//i.test(m.content||''))return null;
  return {guildId:m.guild_id,channelId:m.channel_id,messageId:m.id};
}
export class GatewayConnection {
  constructor(ctx,env){
    this.ctx=ctx;this.env=env;this.socket=null;this.connecting=null;this.routes=new Set();this.routesAt=0;
    this.active=new Set();this.ordered=Promise.resolve();this.ack=true;this.timer=null;this.stopped=false;
  }
  async api(body){
    if(!['https://franchisehq.app','https://staging.franchise-hq.pages.dev'].includes(this.env.FHQ_ORIGIN))throw new Error('Invalid gateway destination');
    const r=await fetch(`${this.env.FHQ_ORIGIN}/api/internal/loadout-event`,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(180000),headers:{'content-type':'application/json','x-fhq-coaching-scanner':this.env.COACHING_SCANNER_SECRET},body:JSON.stringify(body)});
    if(!r.ok)throw new Error(`Loadout delivery HTTP ${r.status}`);
    const result=await r.json();if(!result.ok||result.busy)throw new Error('Loadout delivery will retry');return result;
  }
  async refreshRoutes(force=false){
    if(!force&&Date.now()-this.routesAt<5000)return;
    const result=await this.api({action:'routes'});
    this.routes=new Set((result.routes||[]).filter(r=>snow(r.guildId)&&snow(r.channelId)).map(r=>`${r.guildId}:${r.channelId}`));this.routesAt=Date.now();
  }
  async start(){
    if(this.env.LOADOUT_GATEWAY_ENABLED!=='true')return {enabled:false};
    if(this.connecting)return this.connecting;
    await this.refreshRoutes();
    if(this.socket?.readyState===1)return {connected:true};
    if(this.socket?.readyState===0)return {connecting:true};
    if(this.stopped||await this.ctx.storage.get('fatal'))return {connected:false,attention:true};
    this.connecting=this.connect().finally(()=>{this.connecting=null;});return this.connecting;
  }
  async connect(){
    const notBefore=await this.ctx.storage.get('connectAfter')||0;
    if(notBefore>Date.now()){await this.ctx.storage.setAlarm(notBefore);return {connected:false,retrying:true};}
    const session=await this.ctx.storage.get('session');this.session=session||null;
    // Existing server-to-server credential authorizes a private bootstrap. The
    // Discord token stays in memory, never in storage, jobs, traces or logs.
    if(!this.botToken){const credentials=await this.api({action:'gateway-credentials'});if(typeof credentials.token!=='string'||!credentials.token)throw new Error('Gateway credential unavailable');this.botToken=credentials.token;}
    let address=session?.url;
    if(!address){
      const r=await fetch('https://discord.com/api/v10/gateway/bot',{headers:{Authorization:`Bot ${this.botToken}`},redirect:'manual',signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw new Error(`Gateway discovery HTTP ${r.status}`);
      const info=await r.json();
      if(info.shards>1)throw new Error('Gateway requires a sharded rollout');
      if(info.session_start_limit?.remaining===0){await this.ctx.storage.put('connectAfter',Date.now()+info.session_start_limit.reset_after);throw new Error('Gateway session budget exhausted');}
      address=info.url;
    }
    const url=new URL(address);if(url.protocol!=='wss:'||!/^gateway(?:-[a-z0-9-]+)?\.discord\.gg$/.test(url.hostname))throw new Error('Invalid Discord gateway');
    url.search='?v=10&encoding=json';
    const ws=new WebSocket(url.toString());this.socket=ws;this.ack=true;
    ws.addEventListener('message',e=>{
      // Persist accepted events in Gateway sequence order, but do not await
      // screenshot analysis on the socket receive path.
      this.ordered=this.ordered.then(()=>this.message(ws,e.data)).catch(()=>this.reconnect(ws));this.ctx.waitUntil(this.ordered);
    });
    ws.addEventListener('close',e=>{
      if(this.socket!==ws)return;
      this.ctx.waitUntil((async()=>{
        if([4004,4010,4011,4012,4013,4014].includes(e.code)){
          this.stopped=true;clearTimeout(this.timer);await this.ctx.storage.put('fatal',e.code);console.error(JSON.stringify({event:'loadout-gateway-configuration-error',code:e.code}));return;
        }
        if([4007,4009].includes(e.code)){this.session=null;await this.ctx.storage.delete('session');}
        await this.reconnect(ws);
      })());
    });
    ws.addEventListener('error',()=>this.ctx.waitUntil(this.reconnect(ws)));
    await this.ctx.storage.setAlarm(Date.now()+10000);
    return {connecting:true};
  }
  async message(ws,text){
    if(this.socket!==ws||typeof text!=='string'||text.length>1000000)return;
    const p=JSON.parse(text);
    if(p.op===10){
      this.interval=p.d.heartbeat_interval;if(!Number.isFinite(this.interval)||this.interval<1000)throw new Error('Invalid heartbeat');
      const session=this.session;
      ws.send(JSON.stringify(session?{op:6,d:{token:this.botToken,session_id:session.id,seq:session.seq}}:{op:2,d:{token:this.botToken,intents:1|512|32768,properties:{os:'linux',browser:'FranchiseHQ',device:'FranchiseHQ'}}}));
      this.scheduleHeartbeat(ws,Math.random()*this.interval);return;
    }
    if(p.op===11){this.ack=true;return;}
    if(p.op===1){this.heartbeat(ws);return;}
    if(p.op===7){await this.reconnect(ws);return;}
    if(p.op===9){if(!p.d){this.session=null;await this.ctx.storage.delete('session');}await this.reconnect(ws);return;}
    if(p.op!==0)return;
    if(p.t==='READY'){
      this.session={id:p.d.session_id,url:p.d.resume_gateway_url,seq:p.s};
      console.log(JSON.stringify({event:'loadout-gateway-ready'}));
    }
    if(['MESSAGE_CREATE','MESSAGE_UPDATE'].includes(p.t)&&snow(p.d?.channel_id)&&!p.d?.author?.bot){
      if(!this.routes.has(`${p.d.guild_id}:${p.d.channel_id}`))await this.refreshRoutes();
      const event=screenshotEvent(p,this.routes);
      if(event){
        const key='job:'+event.channelId+':'+event.messageId;
        // A later edit must survive an in-flight check of the original image.
        await this.ctx.storage.put(key,{event,revision:crypto.randomUUID(),attempts:0,due:Date.now()});
        this.ctx.waitUntil(this.drain());
      }
    }
    if(this.session&&Number.isInteger(p.s)){this.session.seq=p.s;await this.ctx.storage.put('session',this.session);}
  }
  heartbeat(ws){
    if(this.socket!==ws||ws.readyState!==1)return;
    this.ack=false;ws.send(JSON.stringify({op:1,d:this.session?.seq??null}));
  }
  scheduleHeartbeat(ws,delay){
    clearTimeout(this.timer);this.timer=setTimeout(()=>{
      if(this.socket!==ws)return;
      if(!this.ack){this.ctx.waitUntil(this.reconnect(ws));return;}
      this.heartbeat(ws);this.scheduleHeartbeat(ws,this.interval);
    },delay);
  }
  async reconnect(ws){
    if(this.socket!==ws)return;this.socket=null;clearTimeout(this.timer);try{ws.close(1000,'Reconnect');}catch{}
    const at=Date.now()+5000+Math.floor(Math.random()*5000);await this.ctx.storage.put('connectAfter',at);await this.ctx.storage.setAlarm(at);
  }
  async drain(){
    const jobs=await this.ctx.storage.list({prefix:'job:',limit:100});
    for(const [key,job]of jobs){
      if(this.active.size>=4)break;if(this.active.has(key)||job.due>Date.now())continue;
      this.active.add(key);
      this.ctx.waitUntil((async()=>{
        try{await this.api(job.event);await this.ctx.storage.transaction(async tx=>{if((await tx.get(key))?.revision===job.revision)await tx.delete(key);});}
        catch{job.attempts++;job.due=Date.now()+Math.min(60000,1000*2**Math.min(job.attempts,6));await this.ctx.storage.transaction(async tx=>{if((await tx.get(key))?.revision===job.revision)await tx.put(key,job);});console.warn(JSON.stringify({event:'loadout-gateway-retry',attempt:job.attempts}));}
        finally{this.active.delete(key);await this.ctx.storage.setAlarm(Date.now()+1000);}
      })());
    }
  }
  async alarm(){
    try{await this.start();await this.drain();}
    finally{if(!this.stopped)await this.ctx.storage.setAlarm(Date.now()+10000);}
  }
}
