import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Resvg, initWasm } from '../functions/_lib/vendor/resvg/index.js';
import { LOADOUT_CATALOG } from '../functions/_lib/loadout-catalog.js';
await initWasm(await WebAssembly.compile(await readFile(new URL('../functions/_lib/vendor/resvg/index_bg.wasm',import.meta.url))));
const font=await readFile(new URL('../functions/_lib/vendor/barlow/semibold.bin',import.meta.url));
const esc=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const references=[];
for(let page=0;page<2;page++){
  const entries=LOADOUT_CATALOG.abilities.slice(page*39,page*39+39);
  const cells=await Promise.all(entries.map(async(a,index)=>{
    const bytes=await readFile(new URL(`..${a.icon}`,import.meta.url));
    const x=(index%6)*160,y=Math.floor(index/6)*150;
    return `<g transform="translate(${x},${y})"><image x="30" y="8" width="100" height="100" href="data:image/jpeg;base64,${bytes.toString('base64')}"/><text x="80" y="127" text-anchor="middle" font-size="14">${a.reference}. ${esc(a.name)}</text></g>`;
  }));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1050"><rect width="960" height="1050" fill="#18202a"/><g font-family="Barlow" fill="white">${cells.join('')}</g></svg>`;
  const renderer=new Resvg(svg,{font:{fontBuffers:[font],defaultFontFamily:'Barlow'}});
  const image=renderer.render();
  try{
    const bytes=image.asPng(),filename=`${LOADOUT_CATALOG.version}-reference-${page+1}.png`;
    await writeFile(new URL(`../assets/abilities/${filename}`,import.meta.url),bytes);
    references.push({url:`https://franchisehq.app/assets/abilities/${filename}`,sha256:createHash('sha256').update(bytes).digest('hex')});
  }finally{image.free();renderer.free();}
}
await writeFile(new URL('../functions/_lib/loadout-references.js',import.meta.url),`export const LOADOUT_REFERENCES = ${JSON.stringify(references,null,2)};\n`);
console.log('Built two versioned reference sheets.');
