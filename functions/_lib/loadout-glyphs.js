// Deterministic glyph proposals. A separate image-layout check must confirm all six staff slots.
export const READER_VERSION='m27-glyph-reader-1';
export const SIZE=48;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function segmentDistance(x,y,ax,ay,bx,by){const t=clamp(((x-ax)*(bx-ax)+(y-ay)*(by-ay))/((bx-ax)**2+(by-ay)**2),0,1);return Math.hypot(x-ax-t*(bx-ax),y-ay-t*(by-ay));}
const comparisonPixels=[];
for(let y=7;y<SIZE-7;y++)for(let x=7;x<SIZE-7;x++){
  // The bright equipped check overlays the dim ability glyph. Exclude its stroke.
  if(Math.min(segmentDistance(x,y,10,25,19,32),segmentDistance(x,y,19,32,36,17))>5.5)comparisonPixels.push(y*SIZE+x);
}
export function gray(image){
 const out=new Float32Array(image.width*image.height);
 for(let i=0;i<out.length;i++)out[i]=.299*image.data[i*4]+.587*image.data[i*4+1]+.114*image.data[i*4+2];
 return out;
}
export function sampleQuad(image,quad,width=SIZE,height=SIZE){
 validateQuad(image,quad);
 const out=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const u=(x+.5)/width,v=(y+.5)/height;
  const sx=(1-v)*(quad[0][0]*(1-u)+quad[1][0]*u)+v*(quad[3][0]*(1-u)+quad[2][0]*u);
  const sy=(1-v)*(quad[0][1]*(1-u)+quad[1][1]*u)+v*(quad[3][1]*(1-u)+quad[2][1]*u);
  const xx=clamp(sx,0,image.width-1),yy=clamp(sy,0,image.height-1),x0=Math.floor(xx),y0=Math.floor(yy),fx=xx-x0,fy=yy-y0;
  for(let c=0;c<4;c++){
   const p=(dx,dy)=>image.data[(Math.min(y0+dy,image.height-1)*image.width+Math.min(x0+dx,image.width-1))*4+c];
   out[(y*width+x)*4+c]=(1-fy)*((1-fx)*p(0,0)+fx*p(1,0))+fy*((1-fx)*p(0,1)+fx*p(1,1));
  }
 }
 return {width,height,data:out};
}
export function validateQuad(image,quad){
 if(!Array.isArray(quad)||quad.length!==4||quad.some(p=>!Array.isArray(p)||p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error('Invalid detected staff row.');
 if(quad.some(([x,y])=>x<0||y<0||x>image.width||y>image.height))throw new Error('Detected staff row exceeds the screenshot.');
 const crosses=quad.map((a,i)=>{const b=quad[(i+1)%4],c=quad[(i+2)%4];return (b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);});
 if(crosses.some(v=>v<=0)||quad.some((p,i)=>Math.hypot(p[0]-quad[(i+1)%4][0],p[1]-quad[(i+1)%4][1])<8))throw new Error('Detected staff row is incomplete.');
}
export function slotQuad(quad,slot){
 const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
 // Exclude the narrow gap between adjacent cards.
 const left=(slot+.012)/6,right=(slot+.985)/6;
 return [mix(quad[0],quad[1],left),mix(quad[0],quad[1],right),mix(quad[3],quad[2],right),mix(quad[3],quad[2],left)];
}
export function rankGlyph(tile,references){
 const obs=gray(tile),n=comparisonPixels.length;
 const mean=comparisonPixels.reduce((sum,i)=>sum+obs[i],0)/n;
 const variance=comparisonPixels.reduce((sum,i)=>sum+(obs[i]-mean)**2,0);
 if(variance/n<12)return [];
 return references.map(ref=>{
  let best=-1;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
   let sum=0,sumSq=0,cross=0;
   for(const i of comparisonPixels){const r=ref.gray[i+dy*SIZE+dx];sum+=r;sumSq+=r*r;cross+=(obs[i]-mean)*r;}
   const score=cross/Math.sqrt(Math.max(1e-9,variance*(sumSq-sum*sum/n)));
   best=Math.max(best,score);
  }
  return {id:ref.id,score:Math.round(best*1000)/1000};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
const letterPixels=comparisonPixels.filter(i=>Math.floor(i/SIZE)>=8&&Math.floor(i/SIZE)<22&&i%SIZE>=9&&i%SIZE<39);
export function rankPositionLetters(tile,references,firstLetter=false){
 const pixels=firstLetter?letterPixels.filter(i=>i%SIZE<26):letterPixels;
 const obs=gray(tile),n=pixels.length,mean=pixels.reduce((s,i)=>s+obs[i],0)/n;
 const variance=pixels.reduce((s,i)=>s+(obs[i]-mean)**2,0);
 if(variance/n<16)return [];
 return references.filter(r=>r.id.startsWith('practician-')).map(ref=>{
  let best=-1;
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
   let sum=0,sq=0,cross=0;
   for(const i of pixels){const r=ref.gray[i+dy*SIZE+dx];sum+=r;sq+=r*r;cross+=(obs[i]-mean)*r;}
   best=Math.max(best,cross/Math.sqrt(Math.max(1e-9,variance*(sq-sum*sum/n))));
  }
  return {id:ref.id,score:Math.round(best*1000)/1000};
 }).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
}
function quadAt(center,dx,dy,width,height){
 const len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,nx=-uy,ny=ux;
 return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[center[0]+x*width*.5*ux+y*height*.5*nx,center[1]+x*width*.5*uy+y*height*.5*ny]);
}
export function proposeLoadout(image,references){
 const detected=detectStaffRow(image);if(!detected)return null;
 const [dx,dy]=detected.spacing,spacing=Math.hypot(dx,dy),anchor=detected.marks[0].p;
 const variants=[];
 // A checkmark can merge into its underlying glyph. Consider missing marks at
 // the start, but retain the extra context so a separate layout check can veto.
 for(let shift=0;shift<=6-detected.count;shift++){
  const slots=[];
  for(let slot=0;slot<6;slot++){
   const index=slot-shift,mark=detected.marks.find(m=>m.slot===index)?.p;
   const center=mark?[mark.x,mark.y]:[anchor.x+index*dx,anchor.y+index*dy];
   const height=Math.min(spacing*1.1,Math.max(spacing*.60,(mark?.h||anchor.h)*2.5));
   const quad=quadAt(center,dx,dy,spacing*.96,height);
   if(quad.some(([x,y])=>x<0||y<0||x>image.width||y>image.height)){slots.length=0;break;}
   const tile=sampleQuad(image,quad),ranked=rankGlyph(tile,references),letters=rankPositionLetters(tile,references);
   let decision=matchDecision(ranked);
   const initial=rankPositionLetters(tile,references,true);
   const distinguished=letters[0]?.score>=.80&&(letters[0].score-(letters[1]?.score||0)>=.08||
    initial[0]?.id===letters[0].id&&initial[0].score>=.83&&initial[0].score-(initial[1]?.score||0)>=.08);
   if(ranked[0]?.id.startsWith('practician-')&&distinguished){
    const full=ranked.find(r=>r.id===letters[0].id);
    if(full?.score>=.45)decision={status:'matched',ids:[letters[0].id],reason:'Position letters distinguish the shared Practician design.'};
   }
   slots.push({quad,tile,ranked,letters,decision,detectedCheck:Boolean(mark)});
  }
  if(slots.length===6){
   const score=slots.reduce((sum,s)=>sum+Math.max(0,(s.ranked[0]?.score||0)-.6),0);
   variants.push({slots,score,shift});
  }
 }
 variants.sort((a,b)=>Math.abs(b.score-a.score)<.02?a.shift-b.shift:b.score-a.score);
 return variants.length?{...variants[0],detected,alternatives:variants.map(v=>({shift:v.shift,score:v.score}))}:null;
}
export function matchDecision(ranked){
 if(!ranked.length)return {status:'uncertain',ids:[],reason:'No usable glyph contrast.'};
 const best=ranked[0],margin=best.score-(ranked[1]?.score||0);
 if(['trimmed-edges','all-hustle'].includes(best.id))return {status:'uncertain',ids:['trimmed-edges','all-hustle'],reason:'These two abilities share a glyph. Selected ability text is required.'};
 if(best.score<.72||margin<.10)return {status:'uncertain',ids:ranked.slice(0,3).map(r=>r.id),reason:'The image match is weak or too close to another ability.'};
 return {status:'matched',ids:[best.id],reason:'Provisional visual match. Similarity is not a probability.'};
}
export function detectStaffRow(image){
 // Bright connected checkmarks remain visible on both console and phone captures.
 // Group three or more regularly spaced marks. The layout reader validates the complete row.
 const {width:w,height:h,data}=image,visited=new Uint8Array(w*h),components=[];
 const bright=i=>Math.min(data[i*4],data[i*4+1],data[i*4+2])>170&&Math.max(data[i*4],data[i*4+1],data[i*4+2])>195;
 const queue=new Int32Array(w*h);
 for(let y=Math.floor(h*.4);y<h*.94;y++)for(let x=0;x<w;x++){
  const start=y*w+x;if(visited[start]||!bright(start))continue;
  let head=0,tail=1,minX=x,maxX=x,minY=y,maxY=y;queue[0]=start;visited[start]=1;
  while(head<tail){const i=queue[head++],xx=i%w,yy=Math.floor(i/w);minX=Math.min(minX,xx);maxX=Math.max(maxX,xx);minY=Math.min(minY,yy);maxY=Math.max(maxY,yy);
   for(const j of [xx>0?i-1:-1,xx<w-1?i+1:-1,yy>0?i-w:-1,yy<h-1?i+w:-1])if(j>=0&&!visited[j]&&bright(j)){visited[j]=1;queue[tail++]=j;}
  }
  const cw=maxX-minX+1,ch=maxY-minY+1,fill=tail/(cw*ch);
  if(cw<w*.012||cw>w*.10||ch<h*.010||cw/ch<1.05||cw/ch>2.8||fill<.18||fill>.72)continue;
  components.push({x:(minX+maxX)/2,y:(minY+maxY)/2,w:cw,h:ch,fill});
 }
 let best=null;
 for(const a of components)for(const b of components){
  const dx=b.x-a.x,dy=b.y-a.y;
  if(dx<a.w*1.25||dx>a.w*2.25||Math.abs(dy/dx)>.42||Math.abs(a.w-b.w)>a.w*.3)continue;
  const group=[];
  for(let i=0;i<6;i++){
   const p=components.find(c=>Math.abs(c.x-a.x-i*dx)<dx*.16&&Math.abs(c.y-a.y-i*dy)<a.h*.4&&Math.abs(c.w-a.w)<a.w*.35);
   if(p)group.push({slot:i,p});
  }
  if(group.length<3||best&&group.length<=best.count)continue;
  const len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len,half=len*.48;
  const left=[a.x-dx*.49,a.y-dy*.49],right=[left[0]+dx*6,left[1]+dy*6];
  const quad=[[left[0]-nx*half,left[1]-ny*half],[right[0]-nx*half,right[1]-ny*half],[right[0]+nx*half,right[1]+ny*half],[left[0]+nx*half,left[1]+ny*half]];
  if(quad.some(p=>p[0]<0||p[1]<0||p[0]>w||p[1]>h))continue;
  best={quad,count:group.length,equippedSlots:group.map(x=>x.slot),marks:group,spacing:[dx,dy],method:'checkmark-group'};
 }
 return best;
}
