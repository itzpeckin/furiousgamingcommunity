import { playerCardImageUrl } from './discord-player-card.js';
const clean=(value,max=90)=>String(value??'').trim().slice(0,max);
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const color=value=>/^#[0-9a-f]{6}$/i.test(value)?value:'#15304D';
const text=(x,y,value,size=24,fill='#F5F8FF',anchor='start')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${escape(value)}</text>`;
export function discordGameCardData({league,season,week,stage,final,away,home}){
  const side=team=>({n:clean(team.name,36),a:clean(team.abbreviation,5),g:clean(team.gm,32)||'Unassigned',
    c:color(team.primary),s:color(team.secondary),l:playerCardImageUrl(team.logo),r:clean(team.record,18),
    score:final&&Number.isFinite(Number(team.score))&&team.score!=null?Number(team.score):null,
    rows:team.rows.slice(0,4).map(row=>[clean(row.label,12),clean(row.name,32),clean(row.detail,85)])});
  return {v:1,f:clean(league,60),y:clean(season,8),w:Number(week),p:clean(stage,20),done:Boolean(final),a:side(away),h:side(home)};
}
export function discordGameCardSvg(card,{awayLogo=null,homeLogo=null}={}){
  const panel=(side,x,logo)=>`<rect x="${x}" y="95" width="568" height="720" rx="18" fill="url(#${x?'home':'away'})"/>
    ${logo?`<image x="${x+26}" y="115" width="98" height="98" href="${escape(logo)}"/>`:text(x+35,174,side.a,30)}
    ${text(x+140,139,side.a,22,'#9AB7D0')}${text(x+140,177,side.n,side.n.length>25?23:29)}
    ${text(x+26,239,`GM  ${side.g}`,23,'#D1DDEA')}${text(x+26,273,side.r,20,'#9AB7D0')}
    ${text(x+518,282,card.done?side.score??'—':'VS',card.done?66:28,'#F5F8FF','end')}
    ${side.rows.map(([label,name,detail],i)=>{const y=341+i*109;return `<rect x="${x+18}" y="${y}" width="532" height="98" rx="12" fill="#10263C" fill-opacity=".9" stroke="#52728F" stroke-opacity=".45"/>${text(x+34,y+23,label.toUpperCase(),16,'#9AB7D0')}${text(x+34,y+53,name,27,'#66AEFF')}${text(x+34,y+81,detail,detail.length>57?16:19)}`}).join('')}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="860" viewBox="0 0 1200 860"><defs>
    <linearGradient id="away" x2="1" y2="1"><stop stop-color="${escape(card.a.c)}"/><stop offset="1" stop-color="#0C1C2E"/></linearGradient>
    <linearGradient id="home" x2="1" y2="1"><stop stop-color="${escape(card.h.c)}"/><stop offset="1" stop-color="#0C1C2E"/></linearGradient></defs>
    <rect width="1200" height="860" rx="24" fill="#0C1C2E"/><g font-family="Barlow" font-weight="600">
    ${text(32,38,card.f,25,'#B9CDE0')}${text(1168,38,`${card.y} · ${card.p} · Week ${card.w}`,21,'#B9CDE0','end')}
    ${text(600,78,card.done?'FINAL · TOP PERFORMERS':'MATCHUP PREVIEW · TOP RATED PLAYERS',23,'#66AEFF','middle')}
    <g transform="translate(24 0)">${panel(card.a,0,awayLogo)}${panel(card.h,584,homeLogo)}</g>
    ${text(32,842,'GAME SUMMARY',16,'#94AEC5')}${text(1168,842,'FRANCHISE HQ',16,'#94AEC5','end')}</g></svg>`;
}
const encode=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const decode=value=>Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function key(env,usages){
  if(!env.DISCORD_BOT_TOKEN)throw new Error('Discord image signing unavailable.');
  return crypto.subtle.importKey('raw',new TextEncoder().encode(`franchisehq:game-card:v1:${env.DISCORD_BOT_TOKEN}`),{name:'HMAC',hash:'SHA-256'},false,usages);
}
export async function signedDiscordGameCardUrl(env,card){
  const payload=encode(new TextEncoder().encode(JSON.stringify(card)));
  if(payload.length>5600)throw new Error('Game card exceeds image contract.');
  const sig=encode(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env,['sign']),new TextEncoder().encode(payload))));
  return `https://franchisehq.app/api/discord/game-card?card=${payload}&sig=${sig}`;
}
export async function verifiedDiscordGameCard(env,url){
  const payload=url.searchParams.get('card')||'',sig=url.searchParams.get('sig')||'';
  if(payload.length>5600||!/^[A-Za-z0-9_-]+$/.test(payload)||!/^[A-Za-z0-9_-]{43}$/.test(sig))return null;
  try{
    if(!await crypto.subtle.verify('HMAC',await key(env,['verify']),decode(sig),new TextEncoder().encode(payload)))return null;
    const card=JSON.parse(new TextDecoder().decode(decode(payload)));
    return card.v===1&&[card.a,card.h].every(s=>Array.isArray(s?.rows)&&s.rows.length<=4)?card:null;
  }catch{return null;}
}
