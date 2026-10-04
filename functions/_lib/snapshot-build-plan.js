import { sha256Hex } from './cloud-platform.js';

// Persist a private, immutable domain plan once, instead of fetching and merging
// the entire season again at every 4,000-record checkpoint. The source snapshot,
// mapping runs and coverage are part of the key; no cross-import reuse occurs.
export async function retainedBuildPlan(bucket,scope,build){
 if(!bucket?.get||!bucket?.put)return build();
 const fingerprint=await sha256Hex(JSON.stringify(scope));
 const key=`snapshot-build-plans/${encodeURIComponent(scope.leagueId)}/${encodeURIComponent(scope.snapshotId)}/${scope.domain}/${fingerprint}.json`;
 const retained=await bucket.get(key);
 if(retained){
  if(Number(retained.size)>24000000)throw new Error('Retained import plan exceeds its size limit.');
  const parsed=JSON.parse(await retained.text());
  if(parsed.fingerprint!==fingerprint||!Array.isArray(parsed.plan?.records))throw new Error('Retained import plan is invalid.');
  return parsed.plan;
 }
 const plan=await build();
 if(plan.response)return plan;
 const value=JSON.stringify({fingerprint,plan});
 if(new TextEncoder().encode(value).byteLength<=24000000)
  await bucket.put(key,value,{httpMetadata:{contentType:'application/json'}});
 return plan;
}
