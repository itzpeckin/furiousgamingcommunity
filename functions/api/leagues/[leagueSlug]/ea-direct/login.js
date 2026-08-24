const CLIENT_ID='MCA_26_COMP_APP';
const REDIRECT_URI='http://127.0.0.1/success';
const AUTH_SOURCE='317239';
const MACHINE_PROFILE_KEY='444d362e8e067fe2';

export async function onRequestGet(){
  const url=new URL('https://accounts.ea.com/connect/auth');
  url.searchParams.set('hide_create','true');
  url.searchParams.set('release_type','prod');
  url.searchParams.set('response_type','code');
  url.searchParams.set('redirect_uri',REDIRECT_URI);
  url.searchParams.set('client_id',CLIENT_ID);
  url.searchParams.set('machineProfileKey',MACHINE_PROFILE_KEY);
  url.searchParams.set('authentication_source',AUTH_SOURCE);
  return Response.redirect(url.toString(),302);
}
