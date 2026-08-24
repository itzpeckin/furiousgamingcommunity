import {RELEASE,json} from './_common.js';

export async function onRequestGet({params}){
  return json({
    ok:true,
    release:RELEASE,
    mode:'public-client-multitenant-test',
    leagueSlug:String(params?.leagueSlug||''),
    sharedEaUserToken:false,
    globalCommissionerToken:false,
    clientSecretRequiredForThisTest:false,
    canonicalWrites:0,
    futureConnectionModel:{
      scope:'per league connection',
      key:['leagueId','connectionOwnerAccountId'],
      stores:['encrypted refresh token','encrypted access token when needed','EA persona id','platform','token expiry','connection status'],
      isolation:'Every league resolves only its own EA connection.',
      unlink:'Deletes/revokes only that league connection.'
    }
  });
}
