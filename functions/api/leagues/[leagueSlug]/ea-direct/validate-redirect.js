import {RELEASE,json} from './_common.js';

export async function onRequestPost({request,params}){
  let body={};
  try{body=await request.json()}catch{}
  const raw=String(body?.redirectUrl||'').trim();
  let u;
  try{u=new URL(raw.startsWith('127.0.0.1')?`http://${raw}`:raw)}catch{
    return json({ok:false,release:RELEASE,error:'Invalid redirect URL.'},400);
  }
  const validHost=u.hostname==='127.0.0.1';
  const code=u.searchParams.get('code')||'';
  return json({
    ok:validHost&&Boolean(code),
    release:RELEASE,
    mode:'oauth-bootstrap',
    leagueSlug:String(params?.leagueSlug||''),
    validLoopbackHost:validHost,
    authorizationCodePresent:Boolean(code),
    authorizationCodeLength:code.length,
    authorizationCodeReturned:false,
    persisted:false,
    canonicalWrites:0,
    next:validHost&&code
      ? 'OAuth bootstrap validated. Keep this code private; 6.0.4 will address a safe token-exchange implementation.'
      : 'Expected an EA redirect to 127.0.0.1 containing a code parameter.'
  },validHost&&code?200:400);
}
