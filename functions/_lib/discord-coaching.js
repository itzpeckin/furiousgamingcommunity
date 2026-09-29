import { discordBotRequest } from './discord-api.js';
import { activeLeagueTeams, activeTeamAssignments, resolveTeam } from './league-teams.js';
import { ARCHETYPES, coachingEvidence, readCoachingScreenshot } from './coaching-images.js';

const snow=value=>/^\d{17,20}$/.test(String(value||''));
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results||[];
const parse=value=>{try{return JSON.parse(value||'[]');}catch{return[];}};
const safe=value=>String(value||'').replace(/([\\*_~`|<>])/g,'\\$1').slice(0,100);
const fail=message=>{throw Object.assign(new Error(message),{status:409});};

function channelPermissions(channel,guildId,botId,member,roles){
  const ids=new Set([guildId,...(member.roles||[])]);
  let permissions=roles.filter(role=>ids.has(role.id)).reduce((value,role)=>value|BigInt(role.permissions||'0'),0n);
  if(permissions&8n)return (1n<<53n)-1n;
  const overwrites=channel.permission_overwrites||[];
  const apply=items=>{let allow=0n,deny=0n;for(const item of items){allow|=BigInt(item.allow||'0');deny|=BigInt(item.deny||'0');}permissions=(permissions&~deny)|allow;};
  apply(overwrites.filter(item=>item.id===guildId));
  apply(overwrites.filter(item=>Number(item.type)===0&&item.id!==guildId&&ids.has(item.id)));
  apply(overwrites.filter(item=>Number(item.type)===1&&item.id===botId));
  return permissions;
}

async function verifyReadAccess(env,config,fetchImpl){
  const [origin,bot]=await Promise.all([
    discordBotRequest(env,`/channels/${config.source_channel_id}`,{fetchImpl,rateLimitRetries:0}),
    discordBotRequest(env,'/users/@me',{fetchImpl,rateLimitRetries:0})
  ]);
  if(origin.guild_id!==config.guild_id)throw new Error('Submission channel no longer belongs to the connected server.');
  const [member,roles,parent]=await Promise.all([
    discordBotRequest(env,`/guilds/${config.guild_id}/members/${bot.id}`,{fetchImpl,rateLimitRetries:0}),
    discordBotRequest(env,`/guilds/${config.guild_id}/roles`,{fetchImpl,rateLimitRetries:0}),
    [11,12].includes(origin.type)?discordBotRequest(env,`/channels/${origin.parent_id}`,{fetchImpl,rateLimitRetries:0}):origin
  ]);
  const mask=(1n<<10n)|(1n<<16n);
  if((channelPermissions(parent,config.guild_id,bot.id,member,roles)&mask)!==mask)
    throw new Error('Submission history permission is missing.');
}

export async function coachingSettings(db,leagueId){
  const row=await db.prepare('SELECT * FROM discord_coaching_settings WHERE league_id=?').bind(leagueId).first();
  return row?{enabled:Boolean(row.enabled),sourceChannelId:row.source_channel_id,reportChannelId:row.report_channel_id,
    banned:parse(row.banned_json),revision:row.revision,historyComplete:Boolean(row.history_complete),lastScanAt:row.last_scan_at,lastError:row.last_error,updatedAt:row.updated_at}
    :{enabled:false,banned:[],historyComplete:false};
}

export async function configureCoaching(c,body,{fetchImpl=fetch}={}){
  const installation=await c.db.prepare("SELECT discord_guild_id guildId FROM discord_league_installations WHERE league_id=? AND status='active'").bind(c.league.id).first();
  if(!installation)fail('Connect this league to Discord first.');
  if(body.enabled===false){
    await c.db.prepare('UPDATE discord_coaching_settings SET enabled=0,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE league_id=?').bind(c.league.id).run();return;
  }
  if(body.enabled!==true)fail('Choose whether coaching checks are enabled.');
  if(!c.env.AI||!c.env.COACHING_SCANNER_SECRET)fail('Automatic screenshot checks are not available yet.');
  const banned=body.banned;
  if(!Array.isArray(banned)||banned.some(key=>!Object.hasOwn(ARCHETYPES,key)))fail('Choose archetypes from the four supported options.');
  let source=String(body.sourceChannelId||'').trim(),report=String(body.reportChannelId||'').trim();
  if(source.startsWith('https://')){
    const url=new URL(source),match=url.pathname.match(/^\/channels\/(\d+)\/(\d+)(?:\/\d+)?\/?$/);
    if(url.hostname!=='discord.com'||!match||match[1]!==installation.guildId)fail('Choose a channel or thread in this league’s connected Discord server.');
    source=match[2];
  }
  if(!snow(source)||!snow(report))fail('Choose the submission channel or thread and the results channel.');
  const [origin,destination,application]=await Promise.all([
    discordBotRequest(c.env,`/channels/${source}`,{fetchImpl}),
    discordBotRequest(c.env,`/channels/${report}`,{fetchImpl}),
    discordBotRequest(c.env,'/applications/@me',{fetchImpl})
  ]);
  if(origin.guild_id!==installation.guildId||destination.guild_id!==installation.guildId
    ||![0,11,12].includes(origin.type)||destination.type!==0)fail('Use a text channel or existing thread for submissions, and a text channel in the same server for results.');
  if(!(Number(application.flags)&((1<<18)|(1<<19))))fail('The bot needs Message Content access enabled in the Discord Developer Portal before automatic screenshot checks can run.');
  const bot=await discordBotRequest(c.env,'/users/@me',{fetchImpl});
  const [member,roles,parent]=await Promise.all([
    discordBotRequest(c.env,`/guilds/${installation.guildId}/members/${bot.id}`,{fetchImpl}),
    discordBotRequest(c.env,`/guilds/${installation.guildId}/roles`,{fetchImpl}),
    origin.parent_id&&[11,12].includes(origin.type)?discordBotRequest(c.env,`/channels/${origin.parent_id}`,{fetchImpl}):origin
  ]);
  const readMask=(1n<<10n)|(1n<<16n),writeMask=readMask|(1n<<11n)|(1n<<14n);
  if((channelPermissions(parent,installation.guildId,bot.id,member,roles)&readMask)!==readMask)
    fail('Allow the FHQ bot to View Channel and Read Message History in the submission channel.');
  if((channelPermissions(destination,installation.guildId,bot.id,member,roles)&writeMask)!==writeMask)
    fail('Allow the FHQ bot to View Channel, Read Message History, Send Messages, and Embed Links in the results channel.');
  await discordBotRequest(c.env,`/channels/${source}/messages?limit=1`,{fetchImpl});
  const existing=await c.db.prepare('SELECT * FROM discord_coaching_settings WHERE league_id=?').bind(c.league.id).first();
  const reset=!existing||existing.source_channel_id!==source||existing.guild_id!==installation.guildId;
  await c.db.prepare(`INSERT INTO discord_coaching_settings(league_id,guild_id,enabled,source_channel_id,report_channel_id,banned_json)
    VALUES(?,?,1,?,?,?) ON CONFLICT(league_id) DO UPDATE SET guild_id=excluded.guild_id,enabled=1,
    source_channel_id=excluded.source_channel_id,report_channel_id=excluded.report_channel_id,banned_json=excluded.banned_json,
    revision=revision+1,history_before=CASE WHEN ? THEN NULL ELSE history_before END,
    history_complete=CASE WHEN ? THEN 0 ELSE history_complete END,live_after=CASE WHEN ? THEN NULL ELSE live_after END,
    live_before=CASE WHEN ? THEN NULL ELSE live_before END,live_head=CASE WHEN ? THEN NULL ELSE live_head END,
    next_scan_at=CURRENT_TIMESTAMP,last_error=NULL,updated_at=CURRENT_TIMESTAMP`)
    .bind(c.league.id,installation.guildId,source,report,JSON.stringify([...new Set(banned)]),...Array(5).fill(reset?1:0)).run();
}

async function identityFor(db,leagueId,authorId,submittedAt,teams){
  const membership=await db.prepare(`SELECT m.id,m.user_id,m.team_id FROM league_memberships m JOIN users u ON u.id=m.user_id
    WHERE m.league_id=? AND m.active=1 AND u.discord_user_id=? LIMIT 1`).bind(leagueId,authorId).first();
  if(!membership)return null;
  const periods=await rows(db,`SELECT p.team_key,p.started_at,p.ended_at FROM team_ownership_periods p
    JOIN gm_identities g ON g.id=p.gm_identity_id AND g.league_id=p.league_id WHERE p.league_id=? AND g.user_id=?`,leagueId,membership.user_id);
  const when=Date.parse(submittedAt),matching=periods.filter(p=>Date.parse(p.started_at)<=when&&(!p.ended_at||when<Date.parse(p.ended_at)));
  const current=resolveTeam(teams,membership.team_id);
  const historical=matching.length===1?resolveTeam(teams,matching[0].team_key):null;
  const knownTeams=new Set(periods.map(p=>resolveTeam(teams,p.team_key)?.teamKey||p.team_key));
  const team=historical||(!periods.length||knownTeams.size===1&&knownTeams.has(current?.teamKey)?current:null);
  return team?{membershipId:membership.id,teamKey:team.teamKey}:null;
}

async function ingestMessages(env,db,config,{fetchImpl}){
  const application=await discordBotRequest(env,'/applications/@me',{fetchImpl,rateLimitRetries:0});
  if(!(Number(application.flags)&((1<<18)|(1<<19))))throw new Error('Message Content access is no longer enabled.');
  // Live and historical cursors are independent so a long backfill never hides
  // new submissions. Discord returns at most 100 messages per request.
  const fetchPage=query=>discordBotRequest(env,`/channels/${config.source_channel_id}/messages?limit=100${query}`,{fetchImpl,rateLimitRetries:0});
  const live=await fetchPage(config.live_before?`&before=${config.live_before}`:config.live_after?`&after=${config.live_after}`:'');
  if(!Array.isArray(live))throw new Error('The submission channel could not be read.');
  const pages=[live];let history=null;
  if(!config.history_complete){
    history=config.history_before?await fetchPage(`&before=${config.history_before}`):live;
    if(!Array.isArray(history))throw new Error('The submission history could not be read.');
    if(history!==live)pages.push(history);
  }
  // Discord can return an empty page when history permission was revoked.
  // Never interpret that as proof that nobody submitted a screenshot.
  if(!live.length||history?.length===0)await verifyReadAccess(env,config,fetchImpl);
  const teams=await activeLeagueTeams(db,config.league_id);
  const messages=[...new Map(pages.flat().filter(m=>snow(m.id)&&snow(m.author?.id)&&!m.author.bot).map(m=>[m.id,m])).values()];
  for(const message of messages){
    const evidence=coachingEvidence(message);if(!evidence.length)continue;
    const identity=await identityFor(db,config.league_id,message.author.id,message.timestamp,teams);
    await db.prepare(`INSERT OR IGNORE INTO discord_coaching_submissions
      (league_id,channel_id,message_id,author_id,submitted_at,membership_id,team_key,evidence_json)
      VALUES(?,?,?,?,?,?,?,?)`).bind(config.league_id,config.source_channel_id,message.id,message.author.id,message.timestamp,
        identity?.membershipId||null,identity?.teamKey||null,JSON.stringify(evidence)).run();
  }
  const ids=live.map(m=>m.id).filter(snow).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  const old=history?.map(m=>m.id).filter(snow).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  // Walk a descending window down to the previous high-water mark. This also
  // handles providers returning the newest 100 rows for an after query.
  const head=config.live_head||ids.at(-1)||config.live_after;
  const done=!config.live_after||live.length<100||ids.some(id=>BigInt(id)<=BigInt(config.live_after));
  await db.prepare(`UPDATE discord_coaching_settings SET live_after=COALESCE(?,live_after),live_before=?,live_head=?,
    history_before=COALESCE(?,history_before),history_complete=CASE WHEN ? THEN 1 ELSE history_complete END,
    last_scan_at=CURRENT_TIMESTAMP WHERE league_id=? AND lease_token=? AND revision=?`)
    .bind(done?head:null,done?null:ids[0],done?null:head,old?.[0]||null,history&&history.length<100?1:0,config.league_id,config.lease_token,config.revision).run();
}

async function processSubmission(env,db,config,submission,{fetchImpl}){
  let archetype=submission.archetype,coachName=submission.coach_name,status=submission.status;
  if(status==='pending'){
    let message;
    try{message=await discordBotRequest(env,`/channels/${submission.channel_id}/messages/${submission.message_id}`,{fetchImpl,rateLimitRetries:0});}
    catch(error){if(Number(error.status)!==404)throw error;message={author:{id:submission.author_id},attachments:[]};}
    if(message.author?.id!==submission.author_id)throw new Error('The submitted message identity changed.');
    const urls=coachingEvidence(message);
    if(!urls.length){status='removed';}
    else if(!submission.team_key){status='unassigned';}
    else{
      let observed;
      try{observed=await readCoachingScreenshot(env,urls,{fetchImpl});}
      catch(error){if(error.retryable!==false)throw error;observed={archetype:null,coachName:null};}
      archetype=observed.archetype;coachName=observed.coachName;
      status=archetype?(parse(config.banned_json).includes(archetype)?'illegal':'legal'):'unreadable';
    }
  }else if(archetype){status=parse(config.banned_json).includes(archetype)?'illegal':'legal';}
  await db.prepare(`UPDATE discord_coaching_submissions SET archetype=?,coach_name=?,status=?,rule_revision=?,
    attempts=0,last_error=NULL,checked_at=CURRENT_TIMESTAMP WHERE league_id=? AND channel_id=? AND message_id=?`)
    .bind(archetype||null,coachName||null,status,config.revision,config.league_id,submission.channel_id,submission.message_id).run();
  // Re-check commissioner configuration after external inference before posting.
  const current=await db.prepare(`SELECT c.revision FROM discord_coaching_settings c
    JOIN discord_league_installations i ON i.league_id=c.league_id AND i.discord_guild_id=c.guild_id AND i.status='active'
    JOIN leagues l ON l.id=c.league_id AND l.tenant_status='enabled'
    WHERE c.league_id=? AND c.enabled=1 AND c.lease_token=? AND c.revision=?`)
    .bind(config.league_id,config.lease_token,config.revision).first();
  if(!current)return;
  const teams=await activeLeagueTeams(db,config.league_id),team=resolveTeam(teams,submission.team_key);
  const labels={legal:'Legal',illegal:'Illegal',unreadable:'Clearer screenshot needed',unassigned:'Team assignment needed',removed:'Submission removed'};
  const explanation=status==='illegal'?`${ARCHETYPES[archetype]} is banned by this league.`:status==='legal'?`${ARCHETYPES[archetype]} is allowed by this league.`
    :status==='unreadable'?'Please post a clearer Coach Overview screenshot showing the ARCHETYPE label and its written value.'
    :status==='unassigned'?'Link your Discord account and confirm your team in FHQ, then resubmit the screenshot.':'Please submit a new coaching archetype screenshot.';
  const marker=`coach:${submission.channel_id}:${submission.message_id}`;
  const body={content:`<@${submission.author_id}> · **${safe(team?.displayName||'Unassigned team')}** · **${labels[status]}**\n${explanation}${coachName?`\nCoach: ${safe(coachName)}`:''}\n[Original submission](https://discord.com/channels/${config.guild_id}/${submission.channel_id}/${submission.message_id})`,
    embeds:[{footer:{text:marker},description:`Rules revision ${config.revision}`}],allowed_mentions:{parse:[]}};
  let reportId=submission.report_channel_id===config.report_channel_id?submission.report_message_id:null;
  if(!reportId){
    const recent=await discordBotRequest(env,`/channels/${config.report_channel_id}/messages?limit=100`,{fetchImpl,rateLimitRetries:0});
    reportId=recent.find?.(m=>m.author?.bot&&m.embeds?.some(e=>e.footer?.text===marker))?.id||null;
  }
  let posted;
  if(reportId){
    try{posted=await discordBotRequest(env,`/channels/${config.report_channel_id}/messages/${reportId}`,{method:'PATCH',body,fetchImpl,rateLimitRetries:0});}
    catch(error){if(Number(error.status)!==404)throw error;}
  }
  if(!posted)posted=await discordBotRequest(env,`/channels/${config.report_channel_id}/messages`,{
    method:'POST',body:{...body,nonce:submission.message_id,enforce_nonce:true},fetchImpl,rateLimitRetries:0});
  await db.prepare(`UPDATE discord_coaching_submissions SET report_channel_id=?,report_message_id=?,reported_revision=?
    WHERE league_id=? AND channel_id=? AND message_id=?`).bind(config.report_channel_id,posted.id,config.revision,config.league_id,submission.channel_id,submission.message_id).run();
}

export async function scanCoaching(env,db,{fetchImpl=fetch}={}){
  const config=await db.prepare(`SELECT c.* FROM discord_coaching_settings c JOIN discord_league_installations i
    ON i.league_id=c.league_id AND i.discord_guild_id=c.guild_id AND i.status='active'
    JOIN leagues l ON l.id=c.league_id AND l.tenant_status='enabled'
    WHERE c.enabled=1 AND julianday(c.next_scan_at)<=julianday('now')
      AND (c.lease_until IS NULL OR julianday(c.lease_until)<julianday('now')) ORDER BY c.next_scan_at LIMIT 1`).first();
  if(!config)return{ok:true,idle:true};
  config.lease_token=crypto.randomUUID();
  const claim=await db.prepare(`UPDATE discord_coaching_settings SET lease_token=?,lease_until=datetime('now','+5 minutes')
    WHERE league_id=? AND enabled=1 AND revision=? AND (lease_until IS NULL OR julianday(lease_until)<julianday('now'))`)
    .bind(config.lease_token,config.league_id,config.revision).run();
  if(!claim.meta?.changes)return{ok:true,idle:true};
  let submission;
  try{
    await ingestMessages(env,db,config,{fetchImpl});
    submission=await db.prepare(`SELECT * FROM discord_coaching_submissions WHERE league_id=? AND channel_id=?
      AND (status='pending' OR rule_revision<>? OR reported_revision<>?)
      ORDER BY attempts ASC,submitted_at DESC LIMIT 1`).bind(config.league_id,config.source_channel_id,config.revision,config.revision).first();
    if(submission)await processSubmission(env,db,config,submission,{fetchImpl});
    await db.prepare(`UPDATE discord_coaching_settings SET last_error=NULL,next_scan_at=datetime('now',?)
      WHERE league_id=? AND lease_token=?`).bind(submission||!config.history_complete?'+0 seconds':'+30 seconds',config.league_id,config.lease_token).run();
    return{ok:true,processed:Boolean(submission)};
  }catch(error){
    if(submission)await db.prepare(`UPDATE discord_coaching_submissions SET attempts=attempts+1,
      last_error=? WHERE league_id=? AND channel_id=? AND message_id=?`)
      .bind('Screenshot check or delivery will retry.',config.league_id,submission.channel_id,submission.message_id).run();
    await db.prepare(`UPDATE discord_coaching_settings SET last_error=?,next_scan_at=datetime('now','+1 minute')
      WHERE league_id=? AND lease_token=?`).bind('A screenshot or Discord request could not finish. Checks retry automatically. Verify channel permissions if this persists.',config.league_id,config.lease_token).run();
    return{ok:false,retry:true};
  }finally{
    await db.prepare('UPDATE discord_coaching_settings SET lease_token=NULL,lease_until=NULL WHERE league_id=? AND lease_token=?').bind(config.league_id,config.lease_token).run();
  }
}

export async function coachingCommand(c,{missing=false,now=Date.now()}={}){
  const config=await coachingSettings(c.db,c.league.id);
  if(!config.enabled)return 'Coaching archetype checks are disabled. Commissioners can enable them in League Controls → Discord Bot.';
  const teams=await activeLeagueTeams(c.db,c.league.id),assignments=await activeTeamAssignments(c.db,c.league.id,teams);
  const submissions=await rows(c.db,`SELECT * FROM discord_coaching_submissions WHERE league_id=? AND channel_id=? ORDER BY submitted_at DESC`,c.league.id,config.sourceChannelId);
  const timestamp=value=>value?Date.parse(value.includes('T')?value:value.replace(' ','T')+'Z'):NaN;
  const lastActivity=Math.max(timestamp(config.lastScanAt)||0,timestamp(config.updatedAt)||0);
  const stalled=!lastActivity||now-lastActivity>7*60*1000;
  const interrupted=Boolean(config.lastError)||stalled;
  const pending=submissions.filter(s=>s.status==='pending').length;
  const reporting=submissions.filter(s=>s.status!=='pending'&&(s.rule_revision!==config.revision||s.reported_revision!==config.revision)).length;
  const progress=`${submissions.length} submissions found · ${submissions.length-pending} checked · ${pending} awaiting checks${reporting?` · ${reporting} reports awaiting update`:''}.`;
  const scanState=config.lastError?'Scanner retrying after an error.':stalled?'Scanner stalled — no recent progress.':!config.historyComplete?'Scanning earlier messages.':pending?'History read; screenshot checks are still running.':reporting?'History read; result reports are updating.':'History scan complete.';
  const lastScan=timestamp(config.lastScanAt);
  const description=`${scanState}\n${progress}${Number.isFinite(lastScan)?`\nLast history check: <t:${Math.floor(lastScan/1000)}:R>.`:''}${interrupted?'\nScanning is delayed; missing submissions are not yet confirmed. Commissioners can check League Controls → Discord Bot for details.':''}`;
  const lines=[];
  for(const [key,owner] of assignments){
    const submission=submissions.find(s=>s.author_id===owner.discordUserId&&s.team_key===key);
    const status=!submission?(interrupted?'Not yet verified — scan delayed':config.historyComplete?'Not submitted':'Still scanning history')
      :submission.status==='pending'?'Checking screenshot':submission.status==='unreadable'?'Clearer screenshot needed'
      :submission.archetype?(config.banned.includes(submission.archetype)?'Illegal':'Legal'):'Team assignment needed';
    if(missing&&submission?.archetype)continue;
    lines.push(`**${safe(resolveTeam(teams,key)?.displayName||key)}** · ${snow(owner.discordUserId)?`<@${owner.discordUserId}>`:'Discord not linked'}\n${status}${submission?.archetype?` · ${ARCHETYPES[submission.archetype]}`:''}`);
  }
  const fields=[];for(let i=0;i<lines.length;i+=4)fields.push({name:i?'Continued':'Teams',value:lines.slice(i,i+4).join('\n\n'),inline:false});
  return{embeds:[{title:missing?'Coaching archetypes · Missing or incomplete':'Coaching archetypes · League status',
    description,
    fields:fields.length?fields:[{name:interrupted||!config.historyComplete?'Status provisional':'All set',value:interrupted||!config.historyComplete?'Missing submissions cannot be confirmed until scanning catches up.':'No missing submissions.'}],color:interrupted?0xe9aa4a:0x5b83f5}],allowed_mentions:{parse:[]}};
}
