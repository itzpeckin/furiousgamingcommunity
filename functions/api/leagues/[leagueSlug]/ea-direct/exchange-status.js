import {RELEASE,json} from './_common.js';

export async function onRequestGet({env,params}){
  return json({
    ok:true,
    release:RELEASE,
    mode:'authorization-code-exchange',
    leagueSlug:String(params?.leagueSlug||''),
    clientSecretConfigured:Boolean(String(env?.EA_MADDEN_CLIENT_SECRET||'').trim()),
    tokenEndpoint:'accounts.ea.com/connect/token',
    clientId:'MCA_26_COMP_APP',
    redirectUri:'http://127.0.0.1/success',
    tokenPersistenceEnabled:false,
    canonicalWrites:0
  });
}
