import compiledWasm from './vendor/resvg/index_bg.wasm';
import { initWasm, Resvg } from './vendor/resvg/index.js';

// Share one initialization between card rendering and screenshot reading.
export const imageRuntimeReady = initWasm(compiledWasm);
export { Resvg };
