import {RELEASE,json} from './_common.js';

function tokenShape(token){
  const t=String(token||'').trim();
  if(!t)return {present:false};
  const parts=t.split('.');
  let jwt=null;
  if(parts.length===3){
    try{
      const raw=parts[1].replace(/-/g,'+').replace(/_/g,'/');
      const padded=raw+'='.repeat((4-raw.length%4)%4);
      jwt=JSON.parse(atob(padded));
    }catch{}
  }
  const now=Math.floor(Date.now()/1000);
  return {
    present:true,
    length:t.length,
    format:jwt?'jwt-like':'opaque',
    expiresAt:jwt?.exp?new Date(jwt.exp*1000).toISOString():null,
    expired:jwt?.exp?jwt.exp<=now:null,
    secondsRemaining:jwt?.exp?Math.max(0,jwt.exp-now):null,
    issuer:jwt?.iss||null,
    audience:jwt?.aud||null,
    // Never expose token, signature, subject, email, account id, or claims blob.
  };
}

export async function onRequestGet({env,params}){
  const token=String(env?.EA_DIRECT_ACCESS_TOKEN||'').trim();
  return json({
    ok:true,
    release:RELEASE,
    mode:'authentication-discovery',
    leagueSlug:String(params?.leagueSlug||''),
    credential:tokenShape(token),
    discoveryUrlConfigured:Boolean(env?.EA_DIRECT_DISCOVERY_URL),
    passwordStored:false,
    canonicalWrites:0,
    next:token
      ? 'Credential is present. Configure only a verified EA-controlled discovery URL before probing.'
      : 'Obtain a legitimate short-lived EA session/access token through an authorized EA client flow.'
  });
}
