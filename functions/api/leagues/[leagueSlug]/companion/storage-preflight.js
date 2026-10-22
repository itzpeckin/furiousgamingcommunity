import {json} from '../../../../_lib/cloud-platform.js';
import {requireCommissioner} from '../../../../_lib/permissions.js';

// Legacy cleanup treated historical snapshots as disposable test data.
export async function onRequestPost(context){
  const auth=await requireCommissioner(context);
  if(!auth.authorized)return auth.response;
  return json({ok:false,error:'This legacy cleanup has been retired. Storage maintenance runs separately and preserves league history. Continue with the normal importer.',code:'LEGACY_CLEANUP_RETIRED'},410);
}
