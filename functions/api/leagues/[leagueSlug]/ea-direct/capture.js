import {RELEASE,json,safeUrl,allowedEaHost} from './_common.js';

const SECRET_NAMES=/authorization|cookie|token|secret|password|session|credential/i;

function sanitizeHeaders(input){
  const out={};
  if(!input||typeof input!=='object')return out;
  for(const [key,value] of Object.entries(input)){
    if(SECRET_NAMES.test(key))continue;
    const k=String(key).toLowerCase().slice(0,80);
    const v=String(value??'').slice(0,500);
    if(k)out[k]=v;
  }
  return out;
}
function sanitizeBody(value,depth=0){
  if(depth>4)return '[depth-limit]';
  if(Array.isArray(value))return value.slice(0,50).map(v=>sanitizeBody(v,depth+1));
  if(value&&typeof value==='object'){
    const out={};
    for(const [k,v] of Object.entries(value).slice(0,100)){
      if(SECRET_NAMES.test(k))out[k]='[redacted]';
      else out[k]=sanitizeBody(v,depth+1);
    }
    return out;
  }
  if(typeof value==='string')return value.slice(0,2000);
  return value;
}

export async function onRequestPost({request,params}){
  let body={};
  try{body=await request.json()}catch{
    return json({ok:false,release:RELEASE,error:'Expected JSON capture metadata.'},400);
  }

  if(body?.password||body?.eaPassword||body?.username||body?.email){
    return json({ok:false,release:RELEASE,error:'Do not submit EA login credentials.'},400);
  }

  const target=safeUrl(body?.url);
  if(!target||!allowedEaHost(target.hostname)){
    return json({ok:false,release:RELEASE,error:'Captured request must target an EA-controlled HTTPS host.'},400);
  }

  const capture={
    method:String(body?.method||'GET').toUpperCase().slice(0,12),
    host:target.hostname,
    path:target.pathname,
    queryKeys:[...target.searchParams.keys()].slice(0,50),
    requestHeaders:sanitizeHeaders(body?.requestHeaders),
    responseStatus:Number(body?.responseStatus)||null,
    responseHeaders:sanitizeHeaders(body?.responseHeaders),
    responsePreview:sanitizeBody(body?.responsePreview??null),
    capturedAt:new Date().toISOString()
  };

  return json({
    ok:true,
    release:RELEASE,
    mode:'session-capture-discovery',
    leagueSlug:String(params?.leagueSlug||''),
    accepted:true,
    persisted:false,
    canonicalWrites:0,
    secretsStored:false,
    capture,
    next:'Use this sanitized metadata to identify the Madden franchise discovery contract before enabling any live probe.'
  });
}
