import {RELEASE,json,safeUrl,allowedEaHost} from './_common.js';

export async function onRequestPost({request,env,params}){
  let body={};
  try{body=await request.json()}catch{}
  const action=String(body?.action||'probe').toLowerCase();

  if(action!=='probe')return json({ok:false,release:RELEASE,error:'Unsupported discovery action.'},400);
  if(body?.password||body?.eaPassword||body?.emailPassword){
    return json({ok:false,release:RELEASE,error:'EA passwords are not accepted or stored by Franchise HQ.'},400);
  }

  const token=String(env?.EA_DIRECT_ACCESS_TOKEN||'').trim();
  if(!token)return json({
    ok:false,release:RELEASE,configured:false,error:'EA_DIRECT_ACCESS_TOKEN is not configured.',
    next:'Configure a short-lived EA access/session token only after the discovery flow is confirmed.'
  },409);

  const target=safeUrl(body?.url||env?.EA_DIRECT_DISCOVERY_URL);
  if(!target||!allowedEaHost(target.hostname)){
    return json({
      ok:false,release:RELEASE,error:'Discovery URL must be an HTTPS EA-controlled host.',
      host:target?.hostname||null
    },400);
  }

  const started=Date.now();
  let response;
  try{
    response=await fetch(target.toString(),{
      method:'GET',
      headers:{
        'accept':'application/json',
        'authorization':`Bearer ${token}`,
        'user-agent':'FranchiseHQ-EA-Direct-Discovery/6.0.1'
      },
      redirect:'manual'
    });
  }catch(error){
    return json({ok:false,release:RELEASE,error:'EA discovery request failed.',detail:String(error?.message||error)},502);
  }

  const contentType=response.headers.get('content-type')||'';
  const text=await response.text();
  let parsed=null;
  if(contentType.includes('json')){
    try{parsed=JSON.parse(text)}catch{}
  }

  // Never return auth headers/cookies. Limit payload during discovery.
  return json({
    ok:response.ok,
    release:RELEASE,
    mode:'discovery-only',
    leagueSlug:String(params?.leagueSlug||''),
    target:{host:target.hostname,path:target.pathname},
    http:response.status,
    durationMs:Date.now()-started,
    contentType,
    responsePreview:parsed ?? text.slice(0,4000),
    canonicalWrites:0
  },response.ok?200:502);
}
