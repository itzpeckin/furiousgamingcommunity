// Metadata only: credentials, message content and Discord responses never enter
// this object. Each credential digest has its own durable admission controller.
import { DurableObject } from 'cloudflare:workers';

export function updatePacing(state,input,now=Date.now()){
  state.routes??={};state.buckets??={};state.leases??={};
  if(!state.nextCleanup||state.nextCleanup<=now){
    for(const [key,value] of Object.entries(state.buckets))if(value.touched<now-86400000)delete state.buckets[key];
    for(const [key,value] of Object.entries(state.routes))if(value.touched<now-86400000)delete state.routes[key];
    for(const [key,value] of Object.entries(state.leases))if(value.until<=now)delete state.leases[key];
    state.nextCleanup=now+3600000;
  }
  if(input.action==='lock'){
    const lease=state.leases[input.route];
    if(lease&&lease.until>now&&lease.owner!==input.owner)return{granted:false,retryAfterSeconds:2,scope:'league-job'};
    state.leases[input.route]={owner:input.owner,until:now+180000};
    return{granted:true};
  }
  if(input.action==='unlock'){
    if(state.leases[input.route]?.owner===input.owner)delete state.leases[input.route];
    return{ok:true};
  }
  const key=state.routes[input.route]?.key||input.route;
  const bucket=state.buckets[key]??={until:0,leaseUntil:0,touched:now};
  if(input.action==='reserve'){
    // One in-flight request per bucket prevents oversubscription while learning
    // dynamic limits. Different channels continue independently.
    const until=Math.max(state.globalUntil||0,bucket.until,bucket.leaseUntil);
    if(until>now)return{granted:false,retryAfterSeconds:(until-now)/1000,
      scope:(state.globalUntil||0)>now?'global':bucket.until>now?'bucket':'in-flight'};
    if(!state.windowUntil||state.windowUntil<=now){state.windowUntil=now+1000;state.used=0;}
    // Conservative admission ceiling; Discord response headers remain authoritative.
    if(state.used>=40)return{granted:false,retryAfterSeconds:(state.windowUntil-now)/1000,scope:'global-admission'};
    state.used++;
    bucket.touched=now;bucket.leaseUntil=now+30000;bucket.owner=input.owner;
    return{granted:true};
  }
  if(input.action==='observe'){
    // Ignore a late response from a request whose reservation has been replaced.
    if(bucket.owner!==input.owner)return{ok:true,stale:true};
    bucket.touched=now;bucket.leaseUntil=0;delete bucket.owner;
    let target=bucket;
    if(input.bucket){
      const learned=`${input.major}:bucket:${input.bucket}`;
      state.routes[input.route]={key:learned,touched:now};
      target=state.buckets[learned]??={until:0,leaseUntil:0,touched:now};
      target.touched=now;
      target.until=Math.max(target.until,bucket.until);
    }
    const seconds=input.retryAfterSeconds;
    if(input.status===429&&Number.isFinite(seconds)){
      const until=now+Math.max(0,seconds)*1000+25;
      if(input.global===true)state.globalUntil=Math.max(state.globalUntil||0,until);
      else target.until=Math.max(target.until,until);
    }else if(input.remaining===0&&Number.isFinite(input.resetAfterSeconds)){
      target.until=Math.max(target.until,now+Math.max(0,input.resetAfterSeconds)*1000+25);
    }
    return{ok:true};
  }
  throw new Error('Unknown pacing action.');
}

export class DiscordPacing extends DurableObject{
  constructor(ctx,env){
    super(ctx,env);
    this.state={routes:{},buckets:{},leases:{}};
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS pacing (kind TEXT,key TEXT,value TEXT,touched INTEGER,PRIMARY KEY(kind,key))');
    ctx.storage.sql.exec('DELETE FROM pacing WHERE touched < ?',Date.now()-86400000);
    for(const row of ctx.storage.sql.exec('SELECT kind,key,value FROM pacing')){
      const value=JSON.parse(row.value);
      if(row.kind==='global')Object.assign(this.state,value);
      else this.state[row.kind][row.key]=value;
    }
  }
  health(){
    const row=this.ctx.storage.sql.exec('SELECT 1 AS ready').one();
    return{ready:row.ready===1};
  }
  async coordinate(input){
    const previousCleanup=this.state.nextCleanup;
    const oldKey=this.state.routes[input.route]?.key||input.route;
    const learnedKey=input.bucket?`${input.major}:bucket:${input.bucket}`:oldKey;
    const records=[['routes',input.route],
      ...Array.from(new Set([oldKey,learnedKey]),key=>['buckets',key]),
      ['leases',input.route]];
    const before=records.map(([kind,key])=>JSON.stringify(this.state[kind][key]));
    const globalState=()=>JSON.stringify({globalUntil:this.state.globalUntil,windowUntil:this.state.windowUntil,
      used:this.state.used,nextCleanup:this.state.nextCleanup});
    const previousGlobal=globalState();
    const result=updatePacing(this.state,input);
    // Persist individual route records, not an ever-growing single KV value.
    // Synchronous SQLite commits also make reservation updates atomic.
    this.ctx.storage.transactionSync(()=>{
      if(previousCleanup!==this.state.nextCleanup)this.ctx.storage.sql.exec('DELETE FROM pacing WHERE touched < ?',Date.now()-86400000);
      for(const [index,[kind,key]] of records.entries()){
        const value=this.state[kind][key];
        if(before[index]===JSON.stringify(value))continue;
        if(value)this.ctx.storage.sql.exec('INSERT OR REPLACE INTO pacing VALUES(?,?,?,?)',kind,key,JSON.stringify(value),Date.now());
        else this.ctx.storage.sql.exec('DELETE FROM pacing WHERE kind=? AND key=?',kind,key);
      }
      if(previousGlobal!==globalState())this.ctx.storage.sql.exec('INSERT OR REPLACE INTO pacing VALUES(?,?,?,?)',
        'global','state',globalState(),Date.now());
    });
    return result;
  }
}
