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
  if(u.hostname!=='127.0.0.1')return {error:'Expected the EA loopback redirect host 127.0.0.1.'};
  const code=u.searchParams.get('code');
  if(!code)return {error:'No authorization code was found in the redirect URL.'};
  return {code};
}

function tokenSummary(payload){
  const expires=Number(payload?.expires_in)||null;
  return {
    accessTokenPresent:Boolean(payload?.access_token),
    refreshTokenPresent:Boolean(payload?.refresh_token),
    tokenType:payload?.token_type?String(payload.token_type):null,
    expiresInSeconds:expires,
    scope:payload?.scope?String(payload.scope):null
  };
}

export async function onRequestPost({request,env,params}){
  let body={};
  try{body=await request.json()}catch{
    return json({ok:false,release:RELEASE,error:'Expected JSON body.'},400);
  }
  if(body?.password||body?.eaPassword||body?.email||body?.username||body?.clientSecret){
    return json({ok:false,release:RELEASE,error:'Do not submit EA login credentials or client secrets to this endpoint.'},400);
  }

  const parsed=parseRedirect(body?.redirectUrl);
  if(parsed.error)return json({ok:false,release:RELEASE,error:parsed.error},400);

  const clientSecret=String(env?.EA_MADDEN_CLIENT_SECRET||'').trim();
  if(!clientSecret){
    return json({
      ok:false,release:RELEASE,configured:false,
      error:'EA_MADDEN_CLIENT_SECRET is not configured as a Cloudflare secret.',
      authorizationCodeAccepted:true,
      authorizationCodeReturned:false,
      canonicalWrites:0
    },409);
  }

  const form=new URLSearchParams();
  form.set('grant_type','authorization_code');
  form.set('code',parsed.code);
  form.set('client_id',CLIENT_ID);
  form.set('client_secret',clientSecret);
  form.set('redirect_uri',REDIRECT_URI);

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
    return json({ok:false,release:RELEASE,error:'EA token exchange request failed.',detail:String(error?.message||error),canonicalWrites:0},502);
  }

  const text=await response.text();
  let payload={};
  try{payload=JSON.parse(text)}catch{}

  if(!response.ok){
    return json({
      ok:false,release:RELEASE,
      mode:'authorization-code-exchange',
      eaHttp:response.status,
      durationMs:Date.now()-started,
      eaError:payload?.error?String(payload.error):null,
      eaErrorDescription:payload?.error_description?String(payload.error_description).slice(0,500):null,
      tokenReturned:false,
      authorizationCodeReturned:false,
      canonicalWrites:0
    },502);
  }

  const summary=tokenSummary(payload);
  // 6.0.4a1 deliberately does not persist or return token values.
  return json({
    ok:Boolean(summary.accessTokenPresent),
    release:RELEASE,
    mode:'authorization-code-exchange',
    leagueSlug:String(params?.leagueSlug||''),
    eaHttp:response.status,
    durationMs:Date.now()-started,
    token:summary,
    tokenValuesReturned:false,
    tokenValuesPersisted:false,
    authorizationCodeReturned:false,
    clientSecretReturned:false,
    canonicalWrites:0,
    next:summary.accessTokenPresent
      ? '6.0.4a1 validated. Next build can use the server-side token in the same request flow for Madden persona/session discovery.'
      : 'EA responded successfully but no access token was detected.'
  },summary.accessTokenPresent?200:502);
}
