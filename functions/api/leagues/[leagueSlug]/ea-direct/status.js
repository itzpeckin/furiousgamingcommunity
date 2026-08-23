import {RELEASE,json} from './_common.js';

export async function onRequestGet({env,params}){
  const configured=Boolean(env?.EA_DIRECT_ACCESS_TOKEN);
  const discoveryConfigured=Boolean(env?.EA_DIRECT_DISCOVERY_URL);
  return json({
    ok:true,
    release:RELEASE,
    mode:'session-capture-discovery',
    leagueSlug:String(params?.leagueSlug||''),
    configured,
    discoveryConfigured,
    passwordStored:false,
    productionImportConnected:false,
    writesCanonicalData:false,
    message: configured
      ? 'EA Direct discovery credential is configured. No canonical import writes are enabled.'
      : 'EA Direct discovery is installed but no credential is configured.',
    safety:{
      acceptedCredential:'EA_DIRECT_ACCESS_TOKEN only',
      rejectedCredentialTypes:['EA password','EA email/password pair'],
      allowedDiscoveryHosts:'EA-controlled HTTPS hosts only'
    }
  });
}
