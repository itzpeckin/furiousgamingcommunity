// Shared, deterministic Discord-only presentation. No website or trade-create card changes.
// Stable media-format version: routine application releases must not break issued cards.
export const DISCORD_PLAYER_CARD_VERSION = '1';
const clean = (value, max = 120) => String(value ?? '').trim().slice(0, max);
const rating = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100 ? null : Math.round(Number(value));
const fields = {
  AWR:'awareRating',SPD:'speedRating',THP:'throwPowerRating',AGI:'agilityRating',DAC:'throwAccDeepRating',MAC:'throwAccMidRating',SAC:'throwAccShortRating',TOR:'throwOnRunRating',
  ACC:'accelRating',CAR:'carryRating',BCV:'bCVRating',BTK:'breakTackleRating',COD:'changeOfDirectionRating',CTH:'catchRating',RLS:'releaseRating',JMP:'jumpRating',
  RBK:'runBlockRating',PBK:'passBlockRating',LBK:'leadBlockRating',STR:'strengthRating',IBK:'impactBlockRating',PMV:'powerMovesRating',FMV:'finesseMovesRating',BSH:'blockShedRating',
  TAK:'tackleRating',PRC:'playRecRating',POW:'hitPowerRating',PUR:'pursuitRating',ZCV:'zoneCoverRating',MCV:'manCoverRating',PRS:'pressRating',KPW:'kickPowerRating',KAC:'kickAccRating'
};
const groups = {
  QB:'AWR SPD THP AGI DAC MAC SAC TOR',RB:'SPD ACC AGI CAR BCV BTK COD CTH',WR:'SPD ACC AGI COD CTH RLS JMP RTR',TE:'SPD ACC CTH RTR JMP RBK PBK LBK',
  OL:'STR SPD ACC AGI RBK PBK LBK IBK',EDGE:'SPD ACC STR AGI PMV FMV BSH TAK',DT:'STR BSH PMV FMV TAK PRC POW IBK',
  LB:'SPD ACC TAK POW PUR PRC ZCV MCV',CB:'SPD ACC MCV ZCV PRS PRC JMP CTH',SS:'SPD ACC MCV ZCV JMP CTH TAK POW',K:'KPW KAC'
};
export function playerCardRatingGroup(position) {
  const p = clean(position).toUpperCase().replace(/[^A-Z]/g, '');
  if (['FB','HB','RB'].includes(p)) return 'RB';
  if (['LT','LG','C','RG','RT','OT','OG','OL'].includes(p)) return 'OL';
  if (['LE','RE','LEDG','REDG','LEDGE','REDGE','EDGE','DE'].includes(p)) return 'EDGE';
  if (['SAM','MIKE','WILL','MLB','LOLB','ROLB','SLB','WLB','ILB','OLB','LB'].includes(p)) return 'LB';
  if (['CB','FS'].includes(p)) return 'CB';
  if (['K','P'].includes(p)) return 'K';
  return groups[p] ? p : null;
}
export function playerCardRatings(player) {
  const source = player.ratings || {};
  return (groups[playerCardRatingGroup(player.position)] || '').split(' ').filter(Boolean).map(label => {
    const route = ['routeRunShortRating','routeRunMedRating','routeRunDeepRating'].map(key => rating(source[key]));
    const value = label === 'RTR' ? route.every(v => v !== null) ? Math.round(route.reduce((a,b) => a+b, 0)/3) : null : rating(source[fields[label]]);
    return [label,value];
  });
}
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : fallback;
export function playerCardImageUrl(value) {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (!['ratings-images-prod.pulse.ea.com','a.espncdn.com','static.nfl.com','static.www.nfl.com','franchisehq.app'].includes(url.hostname)) return null;
    if (url.hostname === 'franchisehq.app' && !url.pathname.startsWith('/assets/')) return null;
    return url.href;
  } catch { return null; }
}
export function discordPlayerCardData(player, team = {}, {leagueName = '', lookingFor = null, portraitUrl = null} = {}) {
  const inches = Number(player.heightInches), weight = Number(player.weightLbs);
  return {
    v:DISCORD_PLAYER_CARD_VERSION,n:clean(player.displayName),p:clean(player.position,10),t:clean(team.displayName),a:clean(team.abbreviation,5),
    h:player.heightInches != null && Number.isInteger(inches) && inches >= 48 && inches <= 96 ? `${Math.floor(inches/12)}′ ${inches%12}″` : '—',
    w:player.weightLbs != null && Number.isFinite(weight) && weight >= 100 && weight <= 500 ? `${Math.round(weight)} lb` : '—',
    o:rating(player.overall),g:player.age != null && Number.isInteger(Number(player.age)) && Number(player.age) >= 16 && Number(player.age) <= 65 ? Number(player.age) : null,
    d:clean(player.devTrait,24) || '—',r:playerCardRatings(player),c:color(team.primaryColor,'#15304D'),s:color(team.secondaryColor,'#547697'),
    l:playerCardImageUrl(team.logoUrl || team.logo),i:playerCardImageUrl(portraitUrl),f:clean(leagueName,70),q:lookingFor === null ? null : clean(lookingFor,160)
  };
}
const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const text = (x,y,value,size=24,fill='#F5F8FF',anchor='start') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${escape(value)}</text>`;
export function discordPlayerCardSvg(card, {logo = null, portrait = null} = {}) {
  const height = card.q === null ? 506 : 554;
  const summary = [['OVR',card.o],['AGE',card.g],['DEV',card.d]];
  const cells = card.r.map(([label,value],index) => {
    const x=32+(index%4)*226,y=294+Math.floor(index/4)*88;
    return `<rect x="${x}" y="${y}" width="216" height="78" rx="12" fill="#10263C" fill-opacity=".88" stroke="#52728F" stroke-opacity=".45"/>${text(x+108,y+27,label,20,'#9AB7D0','middle')}${text(x+108,y+63,value,34,value === null ? '#9AB7D0' : '#F5F8FF','middle')}`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="960" height="${height}" viewBox="0 0 960 ${height}">
    <defs><linearGradient id="brand" x2="1" y2="1"><stop stop-color="${escape(card.c)}"/><stop offset=".7" stop-color="#10273E"/><stop offset="1" stop-color="#0C1C2E"/></linearGradient><linearGradient id="accent"><stop stop-color="${escape(card.s)}"/><stop offset="1" stop-color="${escape(card.c)}"/></linearGradient><clipPath id="rounded"><rect x="1" y="1" width="958" height="${height-2}" rx="24"/></clipPath></defs>
    <g clip-path="url(#rounded)" font-family="Barlow" font-weight="600"><rect width="960" height="${height}" fill="url(#brand)"/><path d="M650 0 L820 0 L650 ${height} L480 ${height}Z" fill="#FFFFFF" opacity=".025"/><rect width="960" height="5" fill="url(#accent)"/>
    ${logo ? `<image x="32" y="29" width="64" height="64" xlink:href="${escape(logo)}"/>` : text(32,72,card.a || 'HQ',28,'#B2CBE1')}
    ${text(112,65,card.n.length>29 ? `${card.n.slice(0,28)}…` : card.n,38,'#66AEFF')}${text(112,98,`${card.p || '—'}  ·  HT ${card.h}  ·  WT ${card.w}`,23,'#D1DDEA')}
    ${portrait ? `<image x="764" y="24" width="164" height="202" preserveAspectRatio="xMidYMax meet" xlink:href="${escape(portrait)}"/>` : ''}
    <rect x="32" y="136" width="702" height="90" rx="16" fill="#0E2034" fill-opacity=".68" stroke="#7F9BB8" stroke-opacity=".25"/>
    ${summary.map(([label,value],index)=>text(63+index*226,165,label,19,'#9DB7CF')+text(63+index*226,207,value,typeof value === 'string' ? 28 : 36)).join('')}
    ${text(32,270,'CORE RATINGS',22,'#B9CDE0')}<path d="M195 264H928" stroke="#7F9BB8" stroke-opacity=".3"/>${cells}
    ${card.r.length === 0 ? text(32,338,'Position ratings unavailable',24,'#B9CDE0') : ''}
    ${card.q === null ? '' : `<rect x="32" y="477" width="896" height="40" rx="10" fill="#10263C" fill-opacity=".7"/>${text(48,504,`LOOKING FOR  ·  ${card.q.length>77 ? `${card.q.slice(0,76)}…` : card.q}`,21,'#DCE8F4')}`}
    ${text(32,height-17,card.f,16,'#94AEC5')}${text(928,height-17,'FRANCHISE HQ',16,'#94AEC5','end')}</g><rect x="1" y="1" width="958" height="${height-2}" rx="24" fill="none" stroke="#527592" stroke-width="2"/>
  </svg>`;
}
const base64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unbase64 = text => Uint8Array.from(atob(text.replace(/-/g,'+').replace(/_/g,'/')),char=>char.charCodeAt(0));
async function signingKey(env, usages) {
  if (!env?.DISCORD_BOT_TOKEN) throw new Error('Discord image signing is unavailable.');
  return crypto.subtle.importKey('raw',new TextEncoder().encode(`franchisehq:discord-card:v1:${env.DISCORD_BOT_TOKEN}`),{name:'HMAC',hash:'SHA-256'},false,usages);
}
export async function signedDiscordPlayerCardUrl(env, card) {
  const payload=base64(new TextEncoder().encode(JSON.stringify(card)));
  if(payload.length>3500)throw new Error('Discord card exceeds the image size contract.');
  const signature=base64(new Uint8Array(await crypto.subtle.sign('HMAC',await signingKey(env,['sign']),new TextEncoder().encode(payload))));
  return `https://franchisehq.app/api/discord/player-card?card=${payload}&sig=${signature}`;
}
export async function verifiedDiscordPlayerCard(env,url) {
  const payload=url.searchParams.get('card') || '',signature=url.searchParams.get('sig') || '';
  if(payload.length>3500 || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature))return null;
  try {
    if(!await crypto.subtle.verify('HMAC',await signingKey(env,['verify']),unbase64(signature),new TextEncoder().encode(payload)))return null;
    const card=JSON.parse(new TextDecoder().decode(unbase64(payload)));
    if(card.v!==DISCORD_PLAYER_CARD_VERSION || !Array.isArray(card.r) || card.r.length>8)return null;
    return card;
  } catch { return null; }
}
export async function discordPlayerCardEmbed(c, player, team, {lookingFor=null,portraitUrl=null,url}={}) {
  const card=discordPlayerCardData(player,team,{leagueName:c.league.name,lookingFor,portraitUrl});
  const color=Number.parseInt(card.c.slice(1),16);
  const description=`${card.t || 'Team unavailable'} · ${card.p || '—'} · HT ${card.h} · WT ${card.w}`;
  // Local demo/test contexts without a bot secret retain an accessible native fallback.
  if(!c.env?.DISCORD_BOT_TOKEN)return {title:card.n,url,color,description,...(card.i?{thumbnail:{url:card.i}}:{}),fields:[{name:'OVR · AGE · DEV',value:`${card.o??'—'} · ${card.g??'—'} · ${card.d}`,inline:false},{name:'Core Ratings',value:card.r.map(([k,v])=>`${k} ${v??'—'}`).join(' · ') || 'Unavailable',inline:false},...(lookingFor===null?[]:[{name:'Looking For',value:card.q || 'Open to offers',inline:false}])],footer:{text:`${c.league.name} · ${lookingFor===null?'Player Ratings':'Trade Block'}`}};
  return {title:card.n,url,color,description,image:{url:await signedDiscordPlayerCardUrl(c.env,card)},footer:{text:`${c.league.name} · ${lookingFor===null?'Player Ratings':'Trade Block'}`}};
}
