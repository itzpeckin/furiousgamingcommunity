import { readFile,writeFile } from 'node:fs/promises';
import { Resvg,initWasm } from '../functions/_lib/vendor/resvg/index.js';
import { discordPlayerCardData,discordPlayerCardSvg } from '../functions/_lib/discord-player-card.js';
import { ROOT } from './lib/project.mjs';
import path from 'node:path';

const output=process.argv[2];
if(!output)throw new Error('Provide an output PNG path. Preview uses illustrative fixture ratings, not Production records.');
await initWasm(await WebAssembly.compile(await readFile(path.join(ROOT,'functions/_lib/vendor/resvg/index_bg.wasm'))));
const font=await readFile(path.join(ROOT,'functions/_lib/vendor/barlow/semibold.bin'));
const player={displayName:'Kamari Lassiter',position:'CB',heightInches:72,weightLbs:186,overall:89,age:24,devTrait:'Star',ratings:{speedRating:93,accelRating:94,manCoverRating:88,zoneCoverRating:91,pressRating:87,playRecRating:86,jumpRating:92,catchRating:76}};
const card=discordPlayerCardData(player,{displayName:'Texans',abbreviation:'HOU',primaryColor:'#03202F',secondaryColor:'#A71930'},{leagueName:'FranchiseHQ · Illustrative preview',lookingFor:'Open to offers'});
const imageData=async file=>file?`data:image/png;base64,${(await readFile(file)).toString('base64')}`:null;
const renderer=new Resvg(discordPlayerCardSvg(card,{logo:await imageData(process.argv[3]),portrait:await imageData(process.argv[4])}),{font:{fontBuffers:[font],defaultFontFamily:'Barlow'}});
let image;try{image=renderer.render();await writeFile(output,image.asPng());console.log(`Rendered ${image.width} × ${image.height} PNG preview.`);}finally{image?.free();renderer.free();}
