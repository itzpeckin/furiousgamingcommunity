const invalid=()=>Object.assign(new Error('Attach a clear PNG, JPG or WebP screenshot under 12 megapixels.'),{retryable:false});
export function imageDimensions(bytes){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width,height;
 const text=(a,b)=>String.fromCharCode(...bytes.subarray(a,b));
 if(bytes.length<24)throw invalid();
 if(text(1,4)==='PNG'&&text(12,16)==='IHDR'){width=v.getUint32(16);height=v.getUint32(20);}
 else if(bytes[0]===255&&bytes[1]===216){
  for(let p=2;p+4<bytes.length;){
   if(bytes[p++]!==255)throw invalid();while(bytes[p]===255)p++;
   const marker=bytes[p++];if(marker===217||marker===218)break;
   const len=v.getUint16(p);if(len<2||p+len>bytes.length)throw invalid();
   if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)){
    if(len<7)throw invalid();height=v.getUint16(p+3);width=v.getUint16(p+5);break;
   }p+=len;
  }
 }else if(text(0,4)==='RIFF'&&text(8,12)==='WEBP'){
  const kind=text(12,16);
  if(kind==='VP8X'&&bytes.length>=30){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16);if(bytes[20]&2)throw invalid();}
  else if(kind==='VP8 '&&bytes.length>=30&&bytes[23]===157&&bytes[24]===1&&bytes[25]===42){width=v.getUint16(26,true)&16383;height=v.getUint16(28,true)&16383;}
  else if(kind==='VP8L'&&bytes.length>=25&&bytes[20]===47){const bits=v.getUint32(21,true);width=1+(bits&16383);height=1+((bits>>>14)&16383);}
 }
 if(!width||!height||width>10000||height>10000||width*height>12000000)throw invalid();
 return {width,height};
}
export function dataImage(bytes,type='image/png'){
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return `data:${type};base64,${btoa(binary)}`;
}
function pngChunk(name,data){
 const out=new Uint8Array(data.length+12),view=new DataView(out.buffer);view.setUint32(0,data.length);
 out.set(new TextEncoder().encode(name),4);out.set(data,8);let crc=0xffffffff;
 for(const b of out.subarray(4,-4)){crc^=b;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 view.setUint32(out.length-4,(crc^0xffffffff)>>>0);return out;
}
// A compact grayscale crop is sufficient for slot-state reading. Quantization
// removes phone-camera noise, keeps text/checkmarks and avoids large AI payloads.
export async function grayPng(image){
 const {width,height,data}=image,scan=new Uint8Array((width+1)*height);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4;scan[y*(width+1)+x+1]=Math.min(255,Math.round((.299*data[i]+.587*data[i+1]+.114*data[i+2])/8)*8);
 }
 const compressed=new Uint8Array(await new Response(new Blob([scan]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
 const header=new Uint8Array(13),v=new DataView(header.buffer);v.setUint32(0,width);v.setUint32(4,height);header[8]=8;
 const chunks=[new Uint8Array([137,80,78,71,13,10,26,10]),pngChunk('IHDR',header),pngChunk('IDAT',compressed),pngChunk('IEND',new Uint8Array())];
 const output=new Uint8Array(chunks.reduce((sum,c)=>sum+c.length,0));let offset=0;for(const c of chunks){output.set(c,offset);offset+=c.length;}return output;
}
export function createScreenshotDecoder(Resvg){
 return function decode(data){
  if(!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)||data.length>11000000)throw invalid();
  const binary=atob(data.slice(data.indexOf(',')+1)),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const dimensions=imageDimensions(bytes),scale=Math.min(1,1600/Math.max(dimensions.width,dimensions.height));
  const width=Math.round(dimensions.width*scale),height=Math.round(dimensions.height*scale);
  const svg=(uri,w,h,view)=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="${view.join(' ')}"><image width="${width}" height="${height}" preserveAspectRatio="none" xlink:href="${uri}"/></svg>`;
  let r,im,pixels,reduced;
  try{r=new Resvg(svg(data,width,height,[0,0,width,height]));im=r.render();pixels=im.pixels;reduced=dataImage(im.asPng());}
  catch{throw invalid();}finally{im?.free();r?.free();}
  return {width,height,data:pixels,async context(rect){
   const [x,y,w,h]=rect;
   if(!rect.every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>width||y+h>height)throw invalid();
   let renderer,image;
   try{renderer=new Resvg(svg(reduced,1100,Math.round(1100*h/w),rect));image=renderer.render();return dataImage(await grayPng({width:image.width,height:image.height,data:image.pixels}));}
   finally{image?.free();renderer?.free();}
  }};
 };
}
export function staffContext(image,proposal){
 const points=proposal.slots.flatMap(s=>s.quad),spacing=Math.hypot(...proposal.detected.spacing);
 const x=Math.max(0,Math.floor(Math.min(...points.map(p=>p[0]))-spacing*.4));
 const y=Math.max(0,Math.floor(Math.min(...points.map(p=>p[1]))-spacing*1.3));
 const right=Math.min(image.width,Math.ceil(Math.max(...points.map(p=>p[0]))+spacing*.4));
 const bottom=Math.min(image.height,Math.ceil(Math.max(...points.map(p=>p[1]))+spacing*.2));
 return [x,y,right-x,bottom-y];
}
