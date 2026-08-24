import {RELEASE,json} from './_common.js';

const EA_AUTH='https://accounts.ea.com/connect/auth';
const CLIENT_ID='MCA_26_COMP_APP';
const REDIRECT_URI='http://127.0.0.1/success';
const AUTH_SOURCE='317239';
const MACHINE_PROFILE_KEY='444d362e8e067fe2';

export async function onRequestGet({params}){
  const url=new URL(EA_AUTH);
  url.searchParams.set('hide_create','true');
  url.searchParams.set('release_type','prod');
  url.searchParams.set('response_type','code');
  url.searchParams.set('redirect_uri',REDIRECT_URI);
  url.searchParams.set('client_id',CLIENT_ID);
  url.searchParams.set('machineProfileKey',MACHINE_PROFILE_KEY);
  url.searchParams.set('authentication_source',AUTH_SOURCE);

  return json({
    ok:true,
    release:RELEASE,
    mode:'oauth-bootstrap',
    leagueSlug:String(params?.leagueSlug||''),
    source:'public Snallabot Madden 27 interoperability implementation',
    maddenYear:2027,
    clientId:CLIENT_ID,
    redirectUri:REDIRECT_URI,
    authorizationHost:'accounts.ea.com',
    authorizationPath:'/connect/auth',
    loginUrl:url.toString(),
    clientSecretIncluded:false,
    canonicalWrites:0,
    acceptanceTest:'Open loginUrl, authenticate directly with EA, and confirm EA redirects the browser to 127.0.0.1/success with a code parameter. Do not share the code.'
  });
}
