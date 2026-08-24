import {RELEASE,json} from './_common.js';

const TOKEN_URL='https://accounts.ea.com/connect/token';
const CLIENT_ID='MCA_26_COMP_APP';
const REDIRECT_URI='http://127.0.0.1/success';

function parseRedirect(raw){
  const value=String(raw||'').trim();
  if(!value)return {error:'redirectUrl is required.'};
  let u;
  try{u=new URL(value.startsWith('127.0.0.1')?`http://${value}`:value)}
  catch{return {error:'Invalid redirect URL.'}}
  if(u.hostname!=='127.0.0.1')return {error:'Expected 127.0.0.1 loopback redirect.'};
  const code=u.searchParams.get('code');
  if(!code)return {error:'No authorization code found.'};
  return {code};
}

export async function onRequestPost({request,params}){
  let body={};
  try{body=await request.json()}catch{
    return json({ok:false,release:RELEASE,error:'Expected JSON body.'},400);
  }
  if(body?.password||body?.eaPassword||body?.email||body?.username||body?.clientSecret){
    return json({ok:false,release:RELEASE,error:'Do not submit EA credentials or client secrets.'},400);
  }
  const parsed=parseRedirect(body?.redirectUrl);
  if(parsed.error)return json({ok:false,release:RELEASE,error:parsed.error},400);

  const form=new URLSearchParams({
    grant_type:'authorization_code',
    code:parsed.code,
    client_id:CLIENT_ID,
    redirect_uri:REDIRECT_URI
  });

  const started=Date.now();
  let response;
  try{
    response=await fetch(TOKEN_URL,{
      method:'POST',
      headers:{'content-type':'application/x-www-form-urlencoded','accept':'application/json'},
      body:form.toString(),
      redirect:'manual'
    });
  }catch(error){
    return json({ok:false,release:RELEASE,error:'EA public-client exchange request failed.',detail:String(error?.message||error),canonicalWrites:0},502);
  }

  const text=await response.text();
  let payload={};
  try{payload=JSON.parse(text)}catch{}

  const access=Boolean(payload?.access_token);
  const refresh=Boolean(payload?.refresh_token);

  return json({
    ok:response.ok&&access,
    release:RELEASE,
    mode:'public-client-token-exchange-test',
    leagueSlug:String(params?.leagueSlug||''),
    architecture:'multi-tenant',
    eaHttp:response.status,
    durationMs:Date.now()-started,
    token:{
      accessTokenPresent:access,
      refreshTokenPresent:refresh,
      tokenType:payload?.token_type?String(payload.token_type):null,
      expiresInSeconds:Number(payload?.expires_in)||null
    },
    eaError:response.ok?null:(payload?.error?String(payload.error):null),
    eaErrorDescription:response.ok?null:(payload?.error_description?String(payload.error_description).slice(0,500):null),
    clientSecretUsed:false,
    tokenValuesReturned:false,
    tokenValuesPersisted:false,
    authorizationCodeReturned:false,
    canonicalWrites:0,
    tenantIsolation:{
      currentTest:'No connection is persisted in 6.0.4a1.',
      productionDesign:'One EA connection record per Franchise HQ league/account connection. Never one global commissioner token.',
      requiredKey:'leagueId + connectionOwnerAccountId'
    },
    next:response.ok&&access
      ? 'Public-client exchange succeeded. Build per-league encrypted token persistence and persona discovery next.'
      : 'EA rejected the public-client exchange. Do not add a third-party secret; investigate an authorized client-registration or supported token path.'
  },response.ok&&access?200:502);
}
