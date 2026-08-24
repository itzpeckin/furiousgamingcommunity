import {RELEASE,json} from './_common.js';

const TOKEN_URL='https://accounts.ea.com/connect/token';
const CLIENT_ID='MCA_26_COMP_APP';
const REDIRECT_URI='http://127.0.0.1/success';
const AUTH_SOURCE='317239';

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

  const form=new URLSearchParams();
  form.set('grant_type','authorization_code');
  form.set('code',parsed.code);
  form.set('client_id',CLIENT_ID);
  form.set('redirect_uri',REDIRECT_URI);
  form.set('release_type','prod');
  form.set('authentication_source',AUTH_SOURCE);
  form.set('token_format','JWS');

  const started=Date.now();
  let response;
  try{
    response=await fetch(TOKEN_URL,{
      method:'POST',
      headers:{
        'Accept-Charset':'UTF-8',
        'User-Agent':'Dalvik/2.1.0 (Linux; U; Android 13; sdk_gphone_x86_64 Build/TE1A.220922.031)',
        'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept-Encoding':'gzip',
        'Accept':'application/json'
      },
      body:form.toString(),
      redirect:'manual'
    });
  }catch(error){
    return json({ok:false,release:RELEASE,error:'EA exact public-client exchange request failed.',detail:String(error?.message||error),canonicalWrites:0},502);
  }

  const text=await response.text();
  let payload={};
  try{payload=JSON.parse(text)}catch{}

  const access=Boolean(payload?.access_token);
  const refresh=Boolean(payload?.refresh_token);

  return json({
    ok:response.ok&&access,
    release:RELEASE,
    mode:'exact-public-client-token-exchange-test',
    leagueSlug:String(params?.leagueSlug||''),
    architecture:'multi-tenant',
    eaHttp:response.status,
    durationMs:Date.now()-started,
    requestProfile:{
      clientId:CLIENT_ID,
      redirectUri:REDIRECT_URI,
      releaseType:'prod',
      authenticationSource:AUTH_SOURCE,
      tokenFormat:'JWS',
      clientSecretUsed:false
    },
    token:{
      accessTokenPresent:access,
      refreshTokenPresent:refresh,
      tokenType:payload?.token_type?String(payload.token_type):null,
      expiresInSeconds:Number(payload?.expires_in)||null
    },
    eaError:response.ok?null:(payload?.error?String(payload.error):null),
    eaErrorDescription:response.ok?null:(payload?.error_description?String(payload.error_description).slice(0,500):null),
    tokenValuesReturned:false,
    tokenValuesPersisted:false,
    authorizationCodeReturned:false,
    canonicalWrites:0,
    tenantIsolation:{
      globalCommissionerToken:false,
      currentTest:'No connection is persisted.',
      productionKey:'leagueId + connectionOwnerAccountId'
    },
    conclusion:response.ok&&access
      ? 'EA accepts the exact public-client authorization-code exchange without a client secret.'
      : (payload?.error==='invalid_client'
          ? 'EA still rejected the exact public-client exchange as invalid_client. Treat confidential-client authentication as required unless an authorized alternative is identified.'
          : 'EA rejected the exchange; inspect the sanitized EA error before deciding the next authentication path.'),
    next:response.ok&&access
      ? 'Proceed to per-league encrypted token persistence and Madden persona/session discovery.'
      : 'Do not embed or reuse a third-party client secret. Investigate an authorized EA client credential or another supported session path.'
  },response.ok&&access?200:502);
}
