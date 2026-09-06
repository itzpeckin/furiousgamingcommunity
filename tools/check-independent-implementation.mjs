import { readText, walkFiles } from './lib/project.mjs';

const sourceFiles=(await walkFiles()).filter(file=>(
  /^(?:functions|workers)\//.test(file)
  || ['app.js','trade-module.js','commissioner-hq.js','index.html','styles.css'].includes(file)
)&&!/\.(?:png|jpg|jpeg|gif|webp|zip)$/i.test(file));
const protectedReference=new RegExp(['neon','sportz'].join('\\s*'),'i');
const matches=[];
for(const file of sourceFiles){
  if(protectedReference.test(await readText(file)))matches.push(file);
}
if(matches.length){
  console.error(`Independent implementation guard failed: prohibited third-party product references found in ${matches.join(', ')}.`);
  process.exit(1);
}
console.log(`Independent implementation guard passed: ${sourceFiles.length} product source file(s) contain no prohibited third-party product references.`);
