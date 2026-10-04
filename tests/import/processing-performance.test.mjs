import assert from 'node:assert/strict';
import test from 'node:test';
import {boundedMap} from '../../functions/_lib/bounded-map.js';
import {retainedBuildPlan} from '../../functions/_lib/snapshot-build-plan.js';

test('bounded reads preserve order, cap concurrency, and drain started work before failure returns',async()=>{
 let running=0,peak=0;
 const values=await boundedMap([1,2,3,4,5],2,async n=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,6-n));running--;return n*2;});
 assert.deepEqual(values,[2,4,6,8,10]);assert.equal(peak,2);assert.equal(running,0);
 let drained=false;
 await assert.rejects(boundedMap([1,2],2,async n=>{await new Promise(r=>setTimeout(r,n===1?1:10));if(n===1)throw Error('failed');drained=true;}),/failed/);
 assert.equal(drained,true);
});

test('snapshot checkpoints reuse the exact immutable plan and isolate changes in league, source, and mappings',async()=>{
 const data=new Map(),bucket={get:async key=>data.has(key)?{text:async()=>data.get(key),size:data.get(key).length}:null,put:async(key,value)=>data.set(key,value)};
 const scope={version:'test',leagueId:'a',snapshotId:'one',domain:'statistics',activeSnapshotId:'old',mappingRuns:{statistics:'run1'}};
 let calls=0;const build=async()=>({records:[{externalId:'player-week',item:{yards:123}}],meta:{retained:1,call:++calls}});
 const first=await retainedBuildPlan(bucket,scope,build);
 assert.deepEqual(await retainedBuildPlan(bucket,scope,build),first);assert.equal(calls,1);
 for(const change of [{leagueId:'b'},{snapshotId:'two'},{activeSnapshotId:'new'},{mappingRuns:{statistics:'run2'}}])await retainedBuildPlan(bucket,{...scope,...change},build);
 assert.equal(calls,5);
 const key=[...data.keys()][0];data.set(key,JSON.stringify({fingerprint:'wrong',plan:first}));
 await assert.rejects(retainedBuildPlan(bucket,scope,build),/invalid/);
});

test('rejected snapshot plans are not cached and unavailable cache writes remain retryable',async()=>{
 let writes=0;const bucket={get:async()=>null,put:async()=>{writes++;throw Error('storage unavailable');}};
 const scope={leagueId:'a',snapshotId:'one',domain:'players'};
 const rejection={response:{status:422}};
 assert.equal(await retainedBuildPlan(bucket,scope,async()=>rejection),rejection);assert.equal(writes,0);
 await assert.rejects(retainedBuildPlan(bucket,scope,async()=>({records:[]})),/storage unavailable/);
});
