// Request-local concurrency. Drain every started task even when one fails.
export async function boundedMap(items, limit, work) {
  const results=new Array(items.length);let cursor=0,failure;
  await Promise.all(Array.from({length:Math.min(items.length,Math.max(1,limit))},async()=>{
    while(!failure&&cursor<items.length){
      const index=cursor++;
      try{results[index]=await work(items[index],index);}catch(error){failure ||= error;}
    }
  }));
  if(failure)throw failure;
  return results;
}
