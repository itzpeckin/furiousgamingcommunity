import { discordBotRequest } from './discord-api.js';
import { activeLeagueTeams, activeTeamAssignments, resolveTeam } from './league-teams.js';
import { channelPermissions, identityFor, verifyReadAccess } from './discord-coaching.js';
import { coachingEvidence } from './coaching-images.js';
import { snapshotCurrentPeriod } from './schedule-integrity.js';
import { ABILITY_BY_ID, LOADOUT_CATALOG } from './loadout-catalog.js';
import { readLoadoutScreenshot } from './loadout-images.js';
import { evaluateLoadout } from './loadout-rules.js';

const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const snow=value=>/^\d{17,20}$/.test(String(value||''));
const parse=(value,fallback=null)=>{try{return JSON.parse(value);}catch{return fallback;}};
const safe=value=>String(value||'').replace(/([\\*_~`|<>])/g,'\\$1').slice(0,100);
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
const ready=env=>Boolean(env.AI?.run&&env.COACHING_SCANNER_SECRET&&env.LOADOUT_READER_VERSION===LOADOUT_CATALOG.version);

async function currentThreads(db,leagueId,guildId){
  const snapshot=await db.prepare(`SELECT s.* FROM league_snapshots s JOIN league_active_snapshots a ON a.snapshot_id=s.id
    AND a.league_id=s.league_id WHERE a.league_id=?`).bind(leagueId).first();
  const period=snapshotCurrentPeriod(snapshot);
  if(!period)return [];
  return rows(db,`SELECT t.*,c.history_before,c.history_complete,c.live_after,c.live_before,c.live_head,c.last_scan_at
    FROM discord_schedule_threads t LEFT JOIN discord_loadout_threads c ON c.league_id=t.league_id AND c.thread_id=t.id
    JOIN discord_league_installations i ON i.league_id=t.league_id AND i.discord_guild_id=t.discord_guild_id
      AND i.status='active' AND i.schedule_channel_id=t.parent_channel_id
    WHERE t.league_id=? AND t.discord_guild_id=? AND t.status='active' AND t.discord_thread_id IS NOT NULL
      AND t.season_year=? AND t.phase=? AND t.week_index=? ORDER BY COALESCE(c.last_scan_at,''),t.id`,
    leagueId,guildId,snapshot.season_year,period.stage,period.week);
}

export async function loadoutSettings(db,leagueId,env={}){
  const config=await db.prepare('SELECT * FROM discord_loadout_settings WHERE league_id=?').bind(leagueId).first();
  const threads=config?await currentThreads(db,leagueId,config.guild_id):[];
  const current=threads.length?await rows(db,`SELECT status,rule_revision,reported_revision FROM discord_loadout_submissions
    WHERE league_id=? AND thread_id IN (${threads.map(()=>'?').join(',')}) AND status<>'ignored'`,leagueId,...threads.map(t=>t.id)):[];
  return {enabled:Boolean(config?.enabled),banned:parse(config?.banned_json,[]),banDuplicates:Boolean(config?.ban_duplicates),
    revision:config?.revision||0,catalogVersion:LOADOUT_CATALOG.version,readerReady:ready(env),
    lastScanAt:config?.last_scan_at||null,lastError:config?.last_error||null,
    progress:{threads:threads.length,historyComplete:threads.filter(t=>t.history_complete).length,submissions:current.length,
      pending:current.filter(s=>s.status==='pending').length,
      needsEvidence:current.filter(s=>s.status==='unreadable'||s.status==='unassigned').length,
      reportsPending:current.filter(s=>s.status!=='pending'&&(s.rule_revision!==config?.revision||s.reported_revision!==config?.revision)).length}};
}

export async function configureLoadouts(c,body,{fetchImpl=fetch}={}){
  const installation=await c.db.prepare("SELECT * FROM discord_league_installations WHERE league_id=? AND status='active'").bind(c.league.id).first();
  if(!installation)fail('Connect this league to Discord first.');
  if(typeof body.enabled!=='boolean'||typeof body.banDuplicates!=='boolean'||!Number.isInteger(body.revision)||body.revision<0
    ||body.catalogVersion!==LOADOUT_CATALOG.version||!Array.isArray(body.banned)||body.banned.length>LOADOUT_CATALOG.abilities.length
    ||body.banned.some(id=>!ABILITY_BY_ID.has(id)))fail('Refresh Discord Bot settings, then choose abilities from the current catalog and save again.');
  if(body.enabled){
    if(!ready(c.env))fail('Automatic loadout image checks are awaiting platform activation. You can save ability bans with automatic checks turned off.');
    if(!snow(installation.schedule_channel_id))fail('Choose a scheduling channel in Discord Routing first.');
    const [channel,bot,application]=await Promise.all([
      discordBotRequest(c.env,`/channels/${installation.schedule_channel_id}`,{fetchImpl}),
      discordBotRequest(c.env,'/users/@me',{fetchImpl}),discordBotRequest(c.env,'/applications/@me',{fetchImpl})]);
    if(channel.guild_id!==installation.discord_guild_id||channel.type!==0)fail('Choose the scheduling text channel in this league’s connected server.');
    if(!(Number(application.flags)&((1<<18)|(1<<19))))fail('The FHQ bot needs Message Content access before screenshot checks can run.');
    const [member,roles]=await Promise.all([
      discordBotRequest(c.env,`/guilds/${installation.discord_guild_id}/members/${bot.id}`,{fetchImpl}),
      discordBotRequest(c.env,`/guilds/${installation.discord_guild_id}/roles`,{fetchImpl})]);
    const mask=(1n<<10n)|(1n<<16n)|(1n<<14n)|(1n<<38n);
    if((channelPermissions(channel,installation.discord_guild_id,bot.id,member,roles)&mask)!==mask)
      fail('Allow the FHQ bot to View Channel, Read Message History, Embed Links, and Send Messages in Threads in the scheduling channel.');
  }
  const result=await c.db.prepare(`INSERT INTO discord_loadout_settings(league_id,guild_id,enabled,banned_json,ban_duplicates,catalog_version)
    SELECT ?,?,?,?,?,? WHERE ?=0 AND NOT EXISTS(SELECT 1 FROM discord_loadout_settings WHERE league_id=?)
    ON CONFLICT(league_id) DO NOTHING`).bind(c.league.id,installation.discord_guild_id,body.enabled?1:0,
      JSON.stringify([...new Set(body.banned)]),body.banDuplicates?1:0,LOADOUT_CATALOG.version,body.revision,c.league.id).run();
  if(!result.meta?.changes){
    const update=await c.db.prepare(`UPDATE discord_loadout_settings SET guild_id=?,enabled=?,banned_json=?,ban_duplicates=?,
      catalog_version=?,revision=revision+1,next_scan_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE league_id=? AND revision=?`).bind(installation.discord_guild_id,body.enabled?1:0,JSON.stringify([...new Set(body.banned)]),
      body.banDuplicates?1:0,LOADOUT_CATALOG.version,c.league.id,body.revision).run();
    if(!update.meta?.changes)fail('Another commissioner updated these rules. Refresh Status, review their changes, and save again.');
  }
}

async function ingest(env,db,config,thread,fetchImpl){
  const application=await discordBotRequest(env,'/applications/@me',{fetchImpl,rateLimitRetries:0});
  if(!(Number(application.flags)&((1<<18)|(1<<19))))throw new Error('Message Content access is unavailable.');
  const page=query=>discordBotRequest(env,`/channels/${thread.discord_thread_id}/messages?limit=100${query}`,{fetchImpl,rateLimitRetries:0});
  const live=await page(thread.live_before?`&before=${thread.live_before}`:thread.live_after?`&after=${thread.live_after}`:'');
  const history=thread.history_complete?null:thread.history_before?await page(`&before=${thread.history_before}`):live;
  if(!Array.isArray(live)||history&&!Array.isArray(history))throw new Error('Thread history could not be read.');
  if(!live.length||history?.length===0)await verifyReadAccess(env,{source_channel_id:thread.discord_thread_id,guild_id:config.guild_id},fetchImpl);
  for(const message of new Map([...(history||[]),...live].filter(m=>snow(m.id)&&snow(m.author?.id)&&!m.author.bot).map(m=>[m.id,m])).values()){
    if(!coachingEvidence(message).length)continue;
    await db.prepare(`INSERT OR IGNORE INTO discord_loadout_submissions(league_id,thread_id,message_id,author_id,submitted_at)
      VALUES(?,?,?,?,?)`).bind(config.league_id,thread.id,message.id,message.author.id,message.timestamp).run();
  }
  const sorted=list=>list.map(m=>m.id).filter(snow).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  const ids=sorted(live),old=history?sorted(history):[],head=thread.live_head||ids.at(-1)||thread.live_after;
  const done=!thread.live_after||live.length<100||ids.some(id=>BigInt(id)<=BigInt(thread.live_after));
  await db.prepare(`UPDATE discord_loadout_threads SET live_after=COALESCE(?,live_after),live_before=?,live_head=?,
    history_before=COALESCE(?,history_before),history_complete=CASE WHEN ? THEN 1 ELSE history_complete END,last_scan_at=CURRENT_TIMESTAMP
    WHERE league_id=? AND thread_id=?`).bind(done?head:null,done?null:ids[0],done?null:head,old[0]||null,
      history&&history.length<100?1:0,config.league_id,thread.id).run();
}

async function stillCurrent(db,config,thread){
  const active=await db.prepare(`SELECT s.league_id FROM discord_loadout_settings s JOIN leagues l ON l.id=s.league_id
    WHERE s.league_id=? AND s.enabled=1 AND s.revision=? AND s.lease_token=? AND l.tenant_status='enabled'`)
    .bind(config.league_id,config.revision,config.lease_token).first();
  return Boolean(active&&(await currentThreads(db,config.league_id,config.guild_id)).some(t=>t.id===thread.id));
}

async function processSubmission(env,db,config,thread,submission,fetchImpl){
  let observed=parse(submission.observed_json),result;
  const teams=await activeLeagueTeams(db,config.league_id);
  const identity=await identityFor(db,config.league_id,submission.author_id,submission.submitted_at,teams);
  const team=identity?.teamKey;
  if(submission.status==='pending'){
    let message;
    try{message=await discordBotRequest(env,`/channels/${thread.discord_thread_id}/messages/${submission.message_id}`,{fetchImpl,rateLimitRetries:0});}
    catch(error){if(Number(error.status)!==404)throw error;result={status:'removed',reason:'Submission removed. Post a new loadout screenshot.'};}
    if(message){
      if(message.author?.id!==submission.author_id)throw new Error('Submission author changed.');
      const urls=coachingEvidence(message);
      if(!urls.length)result={status:'removed',reason:'Submission no longer includes a supported screenshot. Post a new screenshot.'};
      else try{observed=await readLoadoutScreenshot(env,urls,{fetchImpl});}
      catch(error){if(error.retryable!==false)throw error;result={status:'unreadable',reason:'Attach one to four clear PNG, JPG, or WebP screenshots, or a public Xbox screenshot link.'};}
    }
  }
  if(!result)result=evaluateLoadout(observed,{banned:parse(config.banned_json,[]),banDuplicates:Boolean(config.ban_duplicates)});
  if(!['ignored','removed'].includes(result.status)&&(!team||![thread.home_team_key,thread.away_team_key].some(key=>resolveTeam(teams,key)?.teamKey===team)))
    result={status:'unassigned',reason:'Link your Discord account and team in FHQ, then post your loadout in your own matchup thread.'};
  if(!await stillCurrent(db,config,thread))return;
  await db.prepare(`UPDATE discord_loadout_submissions SET team_key=?,observed_json=?,status=?,reason=?,rule_revision=?,checked_at=CURRENT_TIMESTAMP
    WHERE league_id=? AND thread_id=? AND message_id=?`).bind(team||null,observed?JSON.stringify(observed):null,result.status,result.reason,
      config.revision,config.league_id,thread.id,submission.message_id).run();
  if(['ignored','removed'].includes(result.status)){
    await db.prepare('UPDATE discord_loadout_submissions SET reported_revision=? WHERE league_id=? AND thread_id=? AND message_id=?')
      .bind(config.revision,config.league_id,thread.id,submission.message_id).run();return;
  }
  const marker=`loadout:${thread.discord_thread_id}:${submission.message_id}`;
  const names=observed?.slots?.filter(s=>s.state==='equipped').map(s=>`Slot ${s.slot}: ${s.candidates.map(id=>ABILITY_BY_ID.get(id)?.name||'Unclear').join(' / ')}`).join('\n');
  const label={legal:'Legal',illegal:'Illegal',unreadable:'Clearer evidence needed',unassigned:'Team link needed'}[result.status];
  const body={content:`<@${submission.author_id}> · **${safe(resolveTeam(teams,team)?.displayName||'Team not verified')}** · **${label}**\n${result.reason}`,
    embeds:[{title:`Weekly staff loadout · Week ${thread.week_index}`,description:names||'Staff abilities could not be fully read.',
      url:`https://discord.com/channels/${config.guild_id}/${thread.discord_thread_id}/${submission.message_id}`,
      color:result.status==='legal'?0x5bd49d:result.status==='illegal'?0xf36d7e:0xe9aa4a,footer:{text:marker}}],allowed_mentions:{parse:[]}};
  let reportId=submission.report_message_id,posted;
  if(!reportId){
    const recent=await discordBotRequest(env,`/channels/${thread.discord_thread_id}/messages?limit=100`,{fetchImpl,rateLimitRetries:0});
    const bot=await discordBotRequest(env,'/users/@me',{fetchImpl,rateLimitRetries:0});
    reportId=recent.find(m=>m.author?.id===bot.id&&m.embeds?.some(e=>e.footer?.text===marker))?.id;
  }
  if(!await stillCurrent(db,config,thread))return;
  if(reportId)try{posted=await discordBotRequest(env,`/channels/${thread.discord_thread_id}/messages/${reportId}`,{method:'PATCH',body,fetchImpl,rateLimitRetries:0});}
  catch(error){if(Number(error.status)!==404)throw error;}
  if(!posted)posted=await discordBotRequest(env,`/channels/${thread.discord_thread_id}/messages`,{method:'POST',body:{...body,nonce:submission.message_id,enforce_nonce:true},fetchImpl,rateLimitRetries:0});
  await db.prepare('UPDATE discord_loadout_submissions SET report_message_id=?,reported_revision=? WHERE league_id=? AND thread_id=? AND message_id=?')
    .bind(posted.id,config.revision,config.league_id,thread.id,submission.message_id).run();
}

export async function scanLoadouts(env,db,{fetchImpl=fetch}={}){
  if(!ready(env))return {ok:true,idle:true};
  const config=await db.prepare(`SELECT s.* FROM discord_loadout_settings s JOIN leagues l ON l.id=s.league_id AND l.tenant_status='enabled'
    JOIN discord_league_installations i ON i.league_id=s.league_id AND i.discord_guild_id=s.guild_id AND i.status='active'
    WHERE s.enabled=1 AND julianday(s.next_scan_at)<=julianday('now') AND (s.lease_until IS NULL OR julianday(s.lease_until)<julianday('now'))
    ORDER BY s.next_scan_at LIMIT 1`).first();
  if(!config)return {ok:true,idle:true};
  config.lease_token=crypto.randomUUID();
  const claim=await db.prepare(`UPDATE discord_loadout_settings SET lease_token=?,lease_until=datetime('now','+5 minutes')
    WHERE league_id=? AND revision=? AND enabled=1 AND (lease_until IS NULL OR julianday(lease_until)<julianday('now'))`)
    .bind(config.lease_token,config.league_id,config.revision).run();
  if(!claim.meta?.changes)return {ok:true,idle:true};
  let submission,thread;
  try{
    thread=(await currentThreads(db,config.league_id,config.guild_id))[0];
    if(thread){
      await db.prepare('INSERT OR IGNORE INTO discord_loadout_threads(league_id,thread_id) VALUES(?,?)').bind(config.league_id,thread.id).run();
      await ingest(env,db,config,thread,fetchImpl);
      submission=await db.prepare(`SELECT * FROM discord_loadout_submissions WHERE league_id=? AND thread_id=?
        AND (status='pending' OR rule_revision<>? OR reported_revision<>?) ORDER BY attempts ASC,submitted_at DESC LIMIT 1`)
        .bind(config.league_id,thread.id,config.revision,config.revision).first();
      if(submission)await processSubmission(env,db,config,thread,submission,fetchImpl);
    }
    await db.prepare(`UPDATE discord_loadout_settings SET last_scan_at=CURRENT_TIMESTAMP,last_error=NULL,next_scan_at=datetime('now',?)
      WHERE league_id=? AND lease_token=?`).bind(thread?'+0 seconds':'+1 minute',config.league_id,config.lease_token).run();
    return {ok:true,processed:Boolean(submission),idle:!thread};
  }catch{
    if(submission)await db.prepare('UPDATE discord_loadout_submissions SET attempts=attempts+1 WHERE league_id=? AND thread_id=? AND message_id=?')
      .bind(config.league_id,thread.id,submission.message_id).run();
    await db.prepare(`UPDATE discord_loadout_settings SET last_error=?,next_scan_at=datetime('now','+1 minute') WHERE league_id=? AND lease_token=?`)
      .bind('A screenshot or Discord request could not finish. Checks retry automatically. Verify scheduling-channel permissions if this persists.',config.league_id,config.lease_token).run();
    return {ok:false,retry:true};
  }finally{
    await db.prepare('UPDATE discord_loadout_settings SET lease_token=NULL,lease_until=NULL WHERE league_id=? AND lease_token=?').bind(config.league_id,config.lease_token).run();
  }
}

export async function loadoutCommand(c,{missing=false}={}){
  const config=await loadoutSettings(c.db,c.league.id,c.env);
  if(!config.enabled)return 'Weekly loadout checks are disabled. Commissioners can configure them in League Controls → Discord Bot → Weekly Loadout Rules.';
  const settings=await c.db.prepare('SELECT guild_id FROM discord_loadout_settings WHERE league_id=?').bind(c.league.id).first();
  const threads=await currentThreads(c.db,c.league.id,settings.guild_id);
  if(!threads.length)return 'There are no tracked scheduling threads for the current imported week. A commissioner can use Retry Schedule Sync in League Controls → Discord Bot.';
  const teams=await activeLeagueTeams(c.db,c.league.id),assignments=await activeTeamAssignments(c.db,c.league.id,teams),lines=[];
  for(const thread of threads){
    const submissions=await rows(c.db,"SELECT * FROM discord_loadout_submissions WHERE league_id=? AND thread_id=? AND status<>'ignored' ORDER BY submitted_at DESC",c.league.id,thread.id);
    const scanTime=Date.parse(String(thread.last_scan_at||'').replace(' ','T')+'Z');
    const caughtUp=config.readerReady&&!config.lastError&&thread.history_complete&&Number.isFinite(scanTime)&&Date.now()-scanTime<10*60*1000;
    for(const key of [thread.away_team_key,thread.home_team_key]){
      const team=resolveTeam(teams,key),owner=assignments.get(team?.teamKey||key);
      if(!owner)continue;
      const submission=submissions.find(s=>s.author_id===owner.discordUserId&&(s.team_key===team?.teamKey||['pending','unassigned'].includes(s.status)));
      if(missing&&['legal','illegal'].includes(submission?.status)&&submission.rule_revision===config.revision)continue;
      const status=!submission?(caughtUp?'Not submitted':'Scanning — missing status not yet confirmed')
        :submission.status==='pending'?'Checking screenshot':submission.rule_revision!==config.revision?'Rechecking updated rules'
        :({legal:'Legal',illegal:'Illegal',unreadable:'Clearer evidence needed',unassigned:'Team link needed',removed:'Submission removed'})[submission.status];
      lines.push(`**${safe(team?.displayName||key)}** · ${snow(owner.discordUserId)?`<@${owner.discordUserId}>`:'Discord not linked'}\n${status}`);
    }
  }
  const fields=[];for(let i=0;i<lines.length;i+=4)fields.push({name:i?'Continued':'Teams',value:lines.slice(i,i+4).join('\n\n')});
  return {embeds:[{title:`Weekly loadouts · ${missing?'Missing or incomplete':'Status'}`,description:`Week ${threads[0].week_index} · ${config.progress.historyComplete}/${threads.length} thread histories read · ${config.progress.pending} awaiting checks.${config.lastError?'\n'+config.lastError:''}`,
    fields:fields.length?fields:[{name:'Status',value:'No matching registered team owners.'}],color:0x5b83f5}],allowed_mentions:{parse:[]}};
}
