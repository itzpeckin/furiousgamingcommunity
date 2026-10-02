import {SIZE,READER_VERSION,gray,sampleQuad,slotQuad,rankGlyph,matchDecision,detectStaffRow,simulateRules} from './loadout-vision.js';
const $=id=>document.getElementById(id),canvas=$('source'),ctx=canvas.getContext('2d',{willReadFrequently:true});
let catalog,references=[],image=null,quad=null,automatic=null,slots=[],expected={},hash='',revision=0,marking=null,drag=-1,rowAdjusted=false,referencesReady=false;
const status=text=>{$('status').textContent=text;};
const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
function plainImage(bitmap,width,height){const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(bitmap,0,0,width,height);return x.getImageData(0,0,width,height);}
function draw(){
 if(!image)return;canvas.width=image.width;canvas.height=image.height;ctx.putImageData(image,0,0);
 if(quad){ctx.strokeStyle='#71e4c0';ctx.lineWidth=2;ctx.beginPath();quad.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.stroke();
  for(let i=1;i<6;i++){const q=slotQuad(quad,i);ctx.beginPath();ctx.moveTo(...q[0]);ctx.lineTo(...q[3]);ctx.stroke();}
  for(let i=0;i<4;i++){ctx.fillStyle='#f4c989';ctx.beginPath();ctx.arc(...quad[i],7,0,Math.PI*2);ctx.fill();ctx.fillStyle='white';ctx.font='18px sans-serif';ctx.fillText(String(i+1),quad[i][0]+10,quad[i][1]-8);}
 }syncCoordinates();
}
function syncCoordinates(){if(!quad)return;const p=quad[Number($('corner').value)];$('corner-x').value=Math.round(p[0]);$('corner-y').value=Math.round(p[1]);}
function invalidate(){revision++;slots=[];expected={};$('results-panel').hidden=true;$('row-confirm').checked=false;}
function detect(){if(!image)return;invalidate();automatic=detectStaffRow(image);rowAdjusted=false;
 quad=automatic?.quad||[[image.width*.16,image.height*.70],[image.width*.60,image.height*.70],[image.width*.60,image.height*.82],[image.width*.16,image.height*.82]];
 draw();status(automatic?`Found ${automatic.count} equipped checkmarks. Inspect the box before reading icons.`:'The staff row could not be located confidently. Use Mark four corners on the complete staff row.');
}
async function loadFile(file){
 if(!file)return;const token=++revision;slots=[];expected={};image=null;quad=null;automatic=null;marking=null;hash='';$('results-panel').hidden=true;$('image-panel').hidden=true;$('row-confirm').checked=false;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>12*1024*1024){status('Choose a PNG, JPG or WebP image under 12 MB.');return;}
 status('Opening screenshot…');let bitmap;
 try{bitmap=await createImageBitmap(file);if(bitmap.width*bitmap.height>25000000)throw new Error('Choose an image smaller than 25 megapixels.');
  const scale=Math.min(1,1600/bitmap.width,1600/bitmap.height);const decoded=plainImage(bitmap,Math.round(bitmap.width*scale),Math.round(bitmap.height*scale));
  const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());if(token!==revision)return;
  image=decoded;hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');$('image-panel').hidden=false;detect();
 }catch(error){if(token===revision)status(error.message||'This image could not be opened.');}finally{bitmap?.close();}
}
function option(value,label){const o=document.createElement('option');o.value=value;o.textContent=label;return o;}
function renderSlots(){
 $('slots').replaceChildren();
 slots.forEach((slot,i)=>{
  const card=document.createElement('article');card.className='slot';const h=document.createElement('h3');h.textContent=`Staff slot ${i+1}`;card.append(h);
  const c=document.createElement('canvas');c.width=SIZE;c.height=SIZE;c.getContext('2d').putImageData(new ImageData(slot.tile.data,SIZE,SIZE),0,0);card.append(c);
  const p=document.createElement('p');p.className=slot.decision.status;p.textContent=slot.state==='unknown'?'Slot state needs confirmation':slot.decision.status==='matched'?'Provisional match':'Uncertain — do not judge legality';card.append(p);
  const list=document.createElement('div');list.className='candidates';
  for(const r of slot.ranked.slice(0,3)){const ability=catalog.abilities.find(a=>a.id===r.id),row=document.createElement('div');row.className='candidate';const img=document.createElement('img');img.src=ability.icon;img.alt='';const name=document.createElement('span');name.textContent=ability.name;const score=document.createElement('strong');score.className='score';score.textContent=r.score.toFixed(3);row.append(img,name,score);list.append(row);}card.append(list);
  const reason=document.createElement('p');reason.textContent=slot.decision.reason;card.append(reason);
  const label=document.createElement('label');label.textContent='Expected answer (your correction)';const select=document.createElement('select');select.dataset.expected=String(i);select.append(option('','Not verified'),option('locked','Locked slot'),option('empty','Empty slot'),option('unreadable','Cannot identify from image'));
  for(const a of catalog.abilities)select.append(option(a.id,a.name));select.value=expected[i]||'';select.addEventListener('change',()=>{expected[i]=select.value;});label.append(select);card.append(label);$('slots').append(card);
 });$('results-panel').hidden=false;simulate();
}
async function analyze(){if(!image||!quad||!referencesReady)return;const token=revision,currentQuad=quad.map(p=>[...p]),currentImage=image;$('analyze').disabled=true;status('Comparing staff glyphs against all 78 references…');
 try{const result=[];for(let i=0;i<6;i++){await nextFrame();if(token!==revision)return;const tile=sampleQuad(currentImage,slotQuad(currentQuad,i)),ranked=rankGlyph(tile,references);result.push({tile,ranked,decision:matchDecision(ranked),state:automatic&&!rowAdjusted&&automatic.equippedSlots.includes(i)?'equipped':'unknown'});}
  if(token!==revision)return;slots=result;expected={};renderSlots();status('Comparison complete. Review each slot and download a test report. No Discord result was posted.');
 }catch(error){status(error.message||'Comparison failed. Try marking the staff row again.');}finally{$('analyze').disabled=!referencesReady;}
}
function simulate(){if(!slots.length)return;const result=simulateRules(slots,{banned:[...$('bans').selectedOptions].map(o=>o.value),banDuplicates:$('duplicates').checked});
 $('simulation').textContent=!$('row-confirm').checked?'Confirm the complete staff row before interpreting a simulation.':result.status==='incomplete'?'Incomplete: one or more slots or abilities remain uncertain. No legal verdict.':result.status==='possible-violation'?`Possible violation in this experiment: ${result.violations.map(v=>`${catalog.abilities.find(a=>a.id===v.id)?.name}: ${v.type}`).join('; ')}.`:'No violation detected in this experiment. This is not an official league verdict.';
}
function report(){return {readerVersion:READER_VERSION,catalogVersion:catalog.version,imageSha256:hash,imageSize:{width:image.width,height:image.height},row:quad,automaticRow:automatic?.quad||null,rowAdjusted,rowConfirmed:$('row-confirm').checked,slots:slots.map((s,i)=>({slot:i+1,state:s.state,decision:s.decision,candidates:s.ranked.slice(0,5),expected:expected[i]||null})),testRules:{banned:[...$('bans').selectedOptions].map(o=>o.value),banDuplicates:$('duplicates').checked},officialVerdict:false};}
function clear(){revision++;image=null;quad=null;automatic=null;slots=[];expected={};hash='';marking=null;drag=-1;$('file').value='';$('source').width=1;$('source').height=1;$('slots').replaceChildren();$('image-panel').hidden=true;$('results-panel').hidden=true;status('Screenshot cleared. Choose another image to test.');}
function point(event){const r=canvas.getBoundingClientRect();return [Math.max(0,Math.min(image.width,(event.clientX-r.left)*image.width/r.width)),Math.max(0,Math.min(image.height,(event.clientY-r.top)*image.height/r.height))];}
canvas.addEventListener('pointerdown',event=>{if(!image)return;const p=point(event);if(marking){marking.push(p);if(marking.length<4)$('mark-help').textContent=`Tap ${['top left','top right','bottom right','bottom left'][marking.length]} corner.`;if(marking.length===4){quad=marking;marking=null;rowAdjusted=true;invalidate();draw();$('mark-help').textContent='Corners set. Select Read staff icons.';}return;}drag=quad?.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<25*image.width/canvas.getBoundingClientRect().width)??-1;if(drag>=0){canvas.setPointerCapture(event.pointerId);invalidate();rowAdjusted=true;}});
canvas.addEventListener('pointermove',event=>{if(drag<0)return;quad[drag]=point(event);draw();});
canvas.addEventListener('pointerup',()=>{drag=-1;});canvas.addEventListener('pointercancel',()=>{drag=-1;});
$('file').addEventListener('change',event=>loadFile(event.target.files[0]));$('detect').addEventListener('click',detect);$('analyze').addEventListener('click',analyze);$('clear').addEventListener('click',clear);
$('mark').addEventListener('click',()=>{marking=[];invalidate();$('mark-help').textContent='Tap the top left corner of the first staff card, then top right of slot 6, bottom right, bottom left.';});
$('corner').addEventListener('change',syncCoordinates);$('apply-corner').addEventListener('click',()=>{if(!quad)return;const x=Number($('corner-x').value),y=Number($('corner-y').value);if(!Number.isFinite(x)||!Number.isFinite(y))return;invalidate();rowAdjusted=true;quad[Number($('corner').value)]=[Math.max(0,Math.min(image.width,x)),Math.max(0,Math.min(image.height,y))];draw();});
for(const id of ['duplicates','bans','row-confirm'])$(id).addEventListener('change',simulate);
$('export').addEventListener('click',()=>{if(!slots.length)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`fhq-loadout-test-${hash.slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
try{
 catalog=await (await fetch('/assets/abilities/catalog.json')).json();
 for(let offset=0;offset<catalog.abilities.length;offset+=6){const batch=await Promise.all(catalog.abilities.slice(offset,offset+6).map(async a=>{const response=await fetch(a.icon);if(!response.ok)throw new Error('An ability reference is unavailable.');const bitmap=await createImageBitmap(await response.blob());try{return {id:a.id,gray:gray(plainImage(bitmap,SIZE,SIZE))};}finally{bitmap.close();}}));references.push(...batch);}
 for(const a of catalog.abilities)$('bans').append(option(a.id,a.name));referencesReady=true;$('analyze').disabled=false;if(!image)status('Ready. Choose a screenshot to test.');
}catch(error){status(`Could not load ability references. Refresh this page to retry. ${error.message}`);}
