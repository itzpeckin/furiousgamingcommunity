import {RELEASE,json,safeUrl,allowedEaHost} from './_common.js';

function sanitizedHeaders(headers){
  const allow=['content-type','date','server','x-request-id','x-correlation-id'];
  const out={};
  for(const key of allow){
    const value=headers.get(key);
    if(value)out[key]=value;
  }
  return out;
}

export async function onRequestPost({request,env,params}){
  let body={};
  try{body=await request.json()}catch{}

  if(body?.password||body?.eaPassword||body?.email||body?.username){
    return json({
      ok:false,release:RELEASE,
      error:'This endpoint does not accept EA usernames, email addresses, or passwords.'
    },400);
  }

  const token=String(env?.EA_DIRECT_ACCESS_TOKEN||'').trim();
  if(!token)return json({ok:false,release:RELEASE,error:'EA_DIRECT_ACCESS_TOKEN is not configured.'},409);

  const target=safeUrl(env?.EA_DIRECT_DISCOVERY_URL);
  if(!target||!allowedEaHost(target.hostname)){
    return json({
      ok:false,release:RELEASE,
      error:'EA_DIRECT_DISCOVERY_URL is missing or is not an allowed EA-controlled HTTPS host.'
    },409);
  }

  const started=Date.now();
  let response;
  try{
    response=await fetch(target.toString(),{
      method:'GET',
      redirect:'manual',
      headers:{
        accept:'application/json',
        authorization:`Bearer ${token}`,
        'user-agent':'FranchiseHQ-EA-Auth-Discovery/6.0.3'
      }
    });
  }catch(error){
    return json({
      ok:false,release:RELEASE,error:'EA session test request failed.',
      detail:String(error?.message||error),canonicalWrites:0
    },502);
  }

  const text=await response.text();
  let bodyPreview=null;
  try{bodyPreview=JSON.parse(text)}catch{bodyPreview=text.slice(0,2500)}

  return json({
    ok:response.ok,
    release:RELEASE,
    mode:'authentication-discovery',
    leagueSlug:String(params?.leagueSlug||''),
    target:{host:target.hostname,path:target.pathname},
    http:response.status,
    durationMs:Date.now()-started,
    responseHeaders:sanitizedHeaders(response.headers),
    responsePreview:bodyPreview,
    tokenReturned:false,
    cookiesReturned:false,
    canonicalWrites:0
  },response.ok?200:502);
}
