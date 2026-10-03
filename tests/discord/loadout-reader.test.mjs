import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ROOT} from '../../tools/lib/project.mjs';
import {LOADOUT_CATALOG} from '../../functions/_lib/loadout-catalog.js';
import {GLYPH_TEMPLATES,glyphReferences,TEMPLATE_CATALOG_VERSION} from '../../functions/_lib/loadout-glyph-templates.js';
import {rankGlyph,matchDecision,detectStaffRow,SIZE} from '../../functions/_lib/loadout-glyphs.js';
import {imageDimensions,grayPng} from '../../functions/_lib/loadout-raster.js';
import {combineLayout,layoutRequest,readLoadoutScreenshot,LOADOUT_READER_VERSION} from '../../functions/_lib/loadout-images.js';
import {evaluateLoadout} from '../../functions/_lib/loadout-rules.js';
const layout=(count=6)=>({kind:'loadout',staffLabelVisible:true,complete:true,slots:Array.from({length:6},(_,i)=>({slot:i+1,state:i<count?'equipped':'locked',stateClear:true}))});
const proposal=(ids=['camp-counselor','field-general'])=>({slots:Array.from({length:6},(_,i)=>({detectedCheck:i<ids.length,decision:{status:i<ids.length?'matched':'uncertain',ids:i<ids.length?[ids[i]]:[]}}))});

test('bundled glyph templates bind every approved icon to its catalog hash',async()=>{
 assert.equal(TEMPLATE_CATALOG_VERSION,LOADOUT_CATALOG.version);assert.equal(GLYPH_TEMPLATES.length,78);
 for(const a of LOADOUT_CATALOG.abilities){const t=GLYPH_TEMPLATES.find(t=>t.id===a.id);assert.ok(t);assert.equal(Buffer.from(t.pixels,'base64').length,SIZE*SIZE);assert.equal(t.sha256,createHash('sha256').update(await readFile(`${ROOT}${a.icon}`)).digest('hex'));}
});

test('exact catalog glyphs with equipped-check masking never confidently identify a different ability',()=>{
 let identified=0;
 for(const ref of glyphReferences()){
  const data=new Uint8Array(SIZE*SIZE*4);for(let i=0;i<ref.gray.length;i++){data.set([ref.gray[i],ref.gray[i],ref.gray[i],255],i*4);}
  const result=matchDecision(rankGlyph({width:SIZE,height:SIZE,data},glyphReferences()));
  if(result.status==='matched'){assert.deepEqual(result.ids,[ref.id]);identified++;}
 }
 assert.ok(identified>=50,`Only ${identified} sufficiently distinct glyphs`);
});

test('complete layout plus known glyphs produces league-specific bans and duplicate verdicts',()=>{
 const observed=combineLayout(proposal(),layout(2));assert.equal(observed.readerVersion,LOADOUT_READER_VERSION);
 assert.equal(evaluateLoadout(observed,{}).status,'legal');assert.equal(evaluateLoadout(observed,{banned:['camp-counselor']}).status,'illegal');
 const double=combineLayout(proposal(['camp-counselor','camp-counselor']),layout(2));assert.equal(evaluateLoadout(double,{banDuplicates:true}).status,'illegal');assert.equal(evaluateLoadout(double,{banDuplicates:false}).status,'legal');
});

test('model claims cannot override missing staff label, clipped slots, ambiguous glyphs or equipped marks',()=>{
 for(const change of [{complete:false},{staffLabelVisible:false},{slots:layout(2).slots.slice(1)},{slots:layout(0).slots}])assert.equal(evaluateLoadout(combineLayout(proposal(),{...layout(2),...change}),{}).status,'unreadable');
 const p=proposal();p.slots[0].decision={status:'uncertain',ids:['camp-counselor','field-general']};
 const read=combineLayout(p,layout(2));assert.equal(evaluateLoadout(read,{banned:['camp-counselor','field-general']}).status,'unreadable');assert.deepEqual(read.unclearSlots,[1]);
 assert.match(evaluateLoadout(read,{}).reason,/slot 1/);
});

test('shared Trimmed Edges/All Hustle glyph remains ambiguous and never proves a duplicate',()=>{
 const p=proposal();p.slots[0].decision={status:'uncertain',ids:['trimmed-edges','all-hustle']};
 const read=combineLayout(p,layout(2));assert.equal(evaluateLoadout(read,{banDuplicates:true}).status,'unreadable');
 assert.equal(evaluateLoadout(read,{banned:['trimmed-edges','all-hustle']}).status,'illegal');
});

test('blank or unrelated imagery has no staff row and never receives a legal result',()=>{
 assert.equal(detectStaffRow({width:400,height:300,data:new Uint8Array(400*300*4)}),null);
 assert.equal(combineLayout(null,{kind:'other'}).kind,'other');assert.equal(evaluateLoadout(combineLayout(null,layout()),{}).status,'unreadable');
});

test('image headers reject decompression bombs and malformed files before raster allocation',async()=>{
 const png=await grayPng({width:32,height:24,data:new Uint8Array(32*24*4)});assert.deepEqual(imageDimensions(png),{width:32,height:24});
 const bomb=png.slice();new DataView(bomb.buffer).setUint32(16,12000);assert.throws(()=>imageDimensions(bomb),/megapixels/);
 assert.throws(()=>imageDimensions(new Uint8Array(25)),/screenshot/);assert.throws(()=>imageDimensions(new Uint8Array([255,216])),/screenshot/);
});

test('layout request labels six slot details and contains neither league rules nor candidate ability names',()=>{
 const request=layoutRequest('data:image/png;base64,AA==',Array(6).fill('data:image/png;base64,AA=='));
 assert.equal(request.messages[1].content.filter(c=>c.type==='image_url').length,7);
 assert.match(request.messages[0].content,/untrusted/);assert.match(request.messages[1].content.at(-2).text,/slot 6/);
 assert.doesNotMatch(JSON.stringify(request),/camp-counselor|banDuplicates/);
});

test('unrelated-image model output is parsed safely and truncated output retries instead of posting a verdict',async()=>{
 const png=await grayPng({width:32,height:24,data:new Uint8Array(32*24*4)}),fetchImpl=async()=>new Response(png,{headers:{'content-type':'image/png'}});
 const decodeImage=()=>({width:32,height:24,data:new Uint8Array(32*24*4),context:async()=> 'data:image/png;base64,AA=='});
 const env={AI:{run:async()=>({response:'{"kind":"other"}'})}};
 assert.equal((await readLoadoutScreenshot(env,['https://cdn.discordapp.com/attachments/1/2/x.png'],{fetchImpl,decodeImage})).kind,'other');
 env.AI.run=async()=>({choices:[{finish_reason:'length',message:{content:'{"kind":"other"}'}}]});
 await assert.rejects(readLoadoutScreenshot(env,['https://cdn.discordapp.com/attachments/1/2/x.png'],{fetchImpl,decodeImage}),/incomplete response/);
});
