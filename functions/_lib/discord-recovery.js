// Persist only recovery categories and safe guidance, never provider payloads or image URLs.
const guidance={
  DISCORD_WAIT:['Discord is pacing requests','FHQ will retry after Discord’s waiting period. Keep the current connection and screenshots. Refresh Status to check progress.','Automatic retry'],
  DISCORD_ACCESS:['Discord channel access needs attention','A Discord server administrator must check the FHQ bot’s channel permissions: View Channel, Read Message History, Send Messages, Embed Links, Create Public Threads, Send Messages in Threads, and Manage Threads as needed for this channel. Then retry the affected operation in League Controls → Discord Bot.','Discord server administrator'],
  DISCORD_CHANNEL:['Discord channel is unavailable','In League Controls → Discord Bot, select Refresh Channels & Roles. Choose an available channel for the affected function and save its settings. A server administrator may need to restore the bot’s access.','Commissioner / server administrator'],
  DISCORD_INTENT:['Screenshot message access is unavailable','The bot application owner must enable Message Content Intent in Discord Developer Portal → Bot and save. If Discord requires approval, the owner must obtain it. Existing submissions stay queued.','Bot application owner'],
  DISCORD_SERVICE:['FHQ’s Discord service needs attention','FHQ support must restore the bot service configuration. Keep the league connected and retain the original submissions.','FHQ support'],
  IMAGE_SERVICE:['Screenshot checking is temporarily unavailable','FHQ will retry the original screenshot. This is not a rules violation. Do not resubmit it. If the delay continues, send FHQ support the recovery details below.','Automatic retry / FHQ support'],
  DISCORD_TEMPORARY:['Discord is temporarily unavailable','FHQ will retry the pending check or report. For scheduling, use Retry Schedule Sync after the service recovers. No new export or import is needed.','Automatic retry / commissioner'],
  DISCORD_UNKNOWN:['This operation could not finish','Refresh Status first. Retry only the affected scheduling sync or pending screenshot checks below. Existing threads and submissions are retained. If it fails again, send FHQ support the recovery details.','Commissioner / FHQ support']
};
const stages=new Set(['history','image','report','schedule','channels','roles','request']);
function wording(code,stage){
  if(code!=='DISCORD_ACCESS')return guidance[code];
  const permissions=['history','image'].includes(stage)?'View Channel and Read Message History'
    :stage==='report'?'View Channel, Read Message History, Embed Links, and Send Messages (or Send Messages in Threads for a matchup thread)'
    :'View Channel, Read Message History, Send Messages, Create Public Threads, Send Messages in Threads, and Manage Threads';
  return [guidance[code][0],`A Discord server administrator must open the affected channel’s Edit Channel → Permissions → FHQ bot and allow ${permissions}. Then retry the affected operation in League Controls → Discord Bot.`,guidance[code][2]];
}
export function discordRecovery(error,{stage='request',nextRetryAt=null}={}){
  const message=String(error?.message||error||''),source=error?.recoverySource;
  const discord=source==='discord'||/Discord API \d{3}/i.test(message);
  const status=discord?Number(error?.status||message.match(/Discord API (\d{3})/i)?.[1]):0;
  let code=source==='image'?'IMAGE_SERVICE'
    :/Message Content/i.test(message)?'DISCORD_INTENT'
    :/bot delivery is not configured|application ID is not configured/i.test(message)||status===401?'DISCORD_SERVICE'
    :status===429||/Discord (?:rate limit|pacing is waiting)/i.test(message)?'DISCORD_WAIT'
    :status===403||/permission.*missing|missing.*permission|Missing Access|Missing Permissions/i.test(message)?'DISCORD_ACCESS'
    :status===404?'DISCORD_CHANNEL'
    :discord&&status>=500||/Discord scheduling coordinator is temporarily unavailable/i.test(message)?'DISCORD_TEMPORARY'
    :'DISCORD_UNKNOWN';
  stage=stages.has(error?.recoveryStage)?error.recoveryStage:stages.has(stage)?stage:'request';
  const [title,text,owner]=wording(code,stage);
  const seconds=Number(error?.retryAfterSeconds);
  const retryAt=nextRetryAt||(code==='DISCORD_WAIT'&&Number.isFinite(seconds)&&seconds>0?new Date(Date.now()+seconds*1000).toISOString():null);
  return {code,title,message:text,owner,stage,
    nextRetryAt:retryAt&&Number.isFinite(Date.parse(retryAt))?retryAt:null};
}
export function savedDiscordRecovery(value,options={}){
  if(!value)return null;
  try{
    const data=JSON.parse(value);
    if(Object.hasOwn(guidance,data?.code)){
      const stage=stages.has(data.stage)?data.stage:stages.has(options.stage)?options.stage:'request';
      const [title,message,owner]=wording(data.code,stage);
      return {code:data.code,title,message,owner,stage,
        nextRetryAt:Number.isFinite(Date.parse(data.nextRetryAt))?data.nextRetryAt:null};
    }
  }catch{/* Older rows contain plain-text failures. */}
  return discordRecovery(value,options);
}
export function screenshotRecoveryState(settings,{kind='coaching',readerReady=true,now=Date.now()}={}){
  const p=settings.progress||{};
  if(!settings.enabled)return 'Checks are off. A commissioner can enable them in League Controls → Discord Bot.';
  if(!readerReady)return 'Screenshot checking is unavailable. FHQ support must restore the image reader; retain the original submissions.';
  if(settings.recovery)return `${settings.recovery.title}. ${settings.recovery.message}`;
  const stamp=String(settings.lastScanAt||settings.updatedAt||'');
  const last=Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(stamp)?stamp:stamp.replace(' ','T')+'Z');
  if(!Number.isFinite(last)||now-last>7*60*1000)return 'No recent scanner progress. Select Refresh Check Status, then Retry Pending Checks. If progress still does not resume, contact FHQ support. Original submissions are retained; missing submissions are not yet confirmed.';
  if(kind==='loadouts'&&!p.threads)return 'No current-week scheduling threads are available. Use Retry Schedule Sync above, then refresh check status.';
  if(kind==='coaching'?!settings.historyComplete:p.historyComplete<p.threads)return 'Reading earlier messages. Missing submissions are not yet confirmed.';
  if(p.pending)return 'History read; screenshots are awaiting image checks. No resubmission is needed while checks are pending.';
  if(p.reportsPending)return 'Image checks are complete; result reports are awaiting delivery or an update in Discord. No resubmission is needed.';
  return 'History and image checks are complete. New submissions are checked automatically.';
}

// Queue existing work only. Do not reset evidence, revisions, cursors, claims,
// or a provider cooldown. The existing scanner supplies concurrency protection.
export async function retryScreenshotChecks(c,kind){
  const table=kind==='coaching'?'discord_coaching_settings':kind==='loadouts'?'discord_loadout_settings':null;
  if(!table)throw Object.assign(new Error('Choose coaching or loadout checks.'),{status:400});
  const result=await c.db.prepare(`UPDATE ${table} SET next_scan_at=CASE
    WHEN julianday(next_scan_at)>julianday('now') THEN next_scan_at ELSE CURRENT_TIMESTAMP END
    WHERE league_id=? AND enabled=1 AND EXISTS(SELECT 1 FROM discord_league_installations i
      JOIN leagues l ON l.id=i.league_id AND l.tenant_status='enabled'
      WHERE i.league_id=${table}.league_id AND i.discord_guild_id=${table}.guild_id AND i.status='active')`)
    .bind(c.league.id).run();
  if(!result.meta?.changes)throw Object.assign(new Error('Connect this league to Discord and enable these checks before retrying.'),{status:409});
  return {queued:true,kind};
}
