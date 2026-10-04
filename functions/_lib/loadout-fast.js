import {sampleQuad,rankGlyph,matchDecision,rankPositionLetters,gray,SIZE} from './loadout-glyphs.js';
import {normalizeLoadout} from './loadout-rules.js';
import {FAST_TEMPLATES} from './loadout-fast-templates.js';

export const TEXT_BOXES=[[.503,.718,.128,.038],[.654,.718,.138,.038],[.503,.765,.128,.038],[.654,.765,.138,.038]];
export const LABEL_BOXES=[[.159,.683,.102,.030],[.474,.685,.10,.026]];
export function rectangle(image,[x,y,w,h],width=160,height=32){return sampleQuad(image,[[x*image.width,y*image.height],[(x+w)*image.width,y*image.height],[(x+w)*image.width,(y+h)*image.height],[x*image.width,(y+h)*image.height]],width,height);}
// Crop to the visible lettering, preserving aspect ratio. This deliberately
// rejects clipped lettering and low-contrast evidence rather than guessing.
export function textPrint(image){
  const values=Array.from({length:image.width*image.height},(_,i)=>Math.min(...image.data.slice(i*4,i*4+3)));
  const max=Math.max(...values),min=Math.min(...values),threshold=min+(max-min)*.60;
  if(max-min<50)return null;
  const lit=values.map(v=>v>threshold);let left=image.width,right=0,top=image.height,bottom=0,count=0;
  for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(lit[y*image.width+x]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);count++;}
  if(count<15||left<1||right>=image.width-1||top<1||bottom>=image.height-1)return null;
  const w=right-left+1,h=bottom-top+1;if(w/h<1.5)return null;
  const data=[];for(let y=0;y<16;y++)for(let x=0;x<128;x++)data.push(lit[(top+Math.min(h-1,Math.floor((y+.5)*h/16)))*image.width+left+Math.min(w-1,Math.floor((x+.5)*w/128))]?1:0);
  return {aspect:w/h,pixels:data};
}
export function textMatch(print,templates){
  if(!print)return null;
  const ranked=templates.map(t=>{
    if(Math.abs(Math.log(print.aspect/t.aspect))>.08)return {id:t.id,score:0};
    let intersect=0,union=0;for(let i=0;i<print.pixels.length;i++){if(print.pixels[i]&&t.pixels[i])intersect++;if(print.pixels[i]||t.pixels[i])union++;}
    return {id:t.id,score:intersect/Math.max(1,union)};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0],next=ranked.find(t=>t.id!==best?.id);
  return best?.score>=.86&&best.score-(next?.score||0)>=.12?best:null;
}
// DL and OL share almost the entire icon. Compare the informative pixels in
// the first letter, rather than rewarding the large identical L/checkmark.
export function linePosition(tile,references){
  const ids=['practician-dl','practician-ol'],pixels=[];
  for(let y=8;y<22;y++)for(let x=9;x<25;x++)pixels.push(y*SIZE+x);
  const normalize=values=>{const mean=values.reduce((a,b)=>a+b,0)/values.length,sd=Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/values.length);return sd<4?null:values.map(v=>(v-mean)/sd);};
  const observed=gray(tile),scores=[];
  for(const a of references.filter(r=>ids.includes(r.id)))for(const b of references.filter(r=>ids.includes(r.id)&&r.id!==a.id)){
    const an=normalize(pixels.map(i=>a.gray[i])),bn=normalize(pixels.map(i=>b.gray[i]));if(!an||!bn)continue;
    const weights=an.map((v,i)=>(v-bn[i])**2),total=weights.reduce((s,w)=>s+w,0);if(total<10)continue;
    let best=Infinity,opposite=Infinity;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const on=normalize(pixels.map(i=>observed[i+dy*SIZE+dx]));if(!on)continue;
      const error=an.reduce((s,v,i)=>s+weights[i]*(on[i]-v)**2,0)/total;
      const other=bn.reduce((s,v,i)=>s+weights[i]*(on[i]-v)**2,0)/total;
      best=Math.min(best,error);opposite=Math.min(opposite,other);
    }
    scores.push({id:a.id,error:best,opposite});
  }
  scores.sort((a,b)=>a.error-b.error);
  const winner=scores[0],other=scores.find(s=>s.id!==winner?.id);
  return winner&&winner.error<.18&&winner.opposite>winner.error*2.5+.12&&(other?.error??0)>winner.error*2+.08?winner.id:null;
}
export function fastLoadout(image,references){
  // Initial supported geometry is a full 16:9 console capture. Phone photos,
  // clipped screenshots and unfamiliar layouts use the independent reader.
  if(Math.abs(image.width/image.height-16/9)>.015)return null;
  for(let i=0;i<LABEL_BOXES.length;i++)if(textMatch(textPrint(rectangle(image,LABEL_BOXES[i])),FAST_TEMPLATES.filter(t=>t.kind==='label'))?.id!==['staff','playsheets'][i])return null;
  const slots=[];
  for(let i=0;i<6;i++){
    const tile=rectangle(image,[.1645+i*.0475,.713,.0456,.0806],SIZE,SIZE);
    const withLocks=rankGlyph(tile,[...references,...FAST_TEMPLATES.filter(t=>t.kind==='staff-locked')]);
    if(withLocks[0]?.id==='locked'&&withLocks[0].score>=.92&&withLocks[0].score-(withLocks[1]?.score||0)>=.15){slots.push({slot:i+1,state:'locked',clear:true,candidates:[]});continue;}
    const ranked=withLocks.filter(r=>r.id!=='locked');let decision=matchDecision(ranked);
    if(['practician-dl','practician-ol'].includes(ranked[0]?.id)&&ranked[0].score>=.85){
      const position=linePosition(tile,references);if(position===ranked[0].id)decision={status:'matched',ids:[position]};
    }
    if(decision.status!=='matched'||ranked[0].score<.82)return null;
    if(decision.ids[0].startsWith('practician-')){
      const letters=rankPositionLetters(tile,references);
      const line=['practician-dl','practician-ol'].includes(decision.ids[0])&&linePosition(tile,references)===decision.ids[0];
      if(!line&&(letters[0]?.id!==decision.ids[0]||letters[0].score<.84||letters[0].score-(letters[1]?.score||0)<.10))return null;
    }
    slots.push({slot:i+1,state:'equipped',clear:true,candidates:decision.ids});
  }
  const sheets=[];
  for(let i=0;i<4;i++){
    const match=textMatch(textPrint(rectangle(image,TEXT_BOXES[i])),FAST_TEMPLATES.filter(t=>t.kind==='playsheet'||t.kind==='playsheet-locked'));
    if(!match)return null;
    sheets.push({slot:i+1,state:match.id==='locked'?'locked':'equipped',id:match.id==='locked'?null:match.id});
  }
  return {...normalizeLoadout({kind:'loadout',complete:true,slots}),playsheets:{complete:true,slots:sheets},readerPath:'fast-verified'};
}

