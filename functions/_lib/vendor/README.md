# Discord card renderer dependencies

- `resvg/index.js` and `index_bg.wasm`: unmodified `@resvg/resvg-wasm` 2.6.2 distribution (ES module renamed from `index.mjs` to `index.js`). Upstream: https://github.com/yisibl/resvg-js, commit `9ca058462ac529120c8cc84ddcd6fef644cc5406`. MPL-2.0 license retained beside the files. npm tarball SHA-512: `FqALmHI8D4o6lk/LRWDnhw95z5eO+eAa6ORjVg09YRR7BkcM6oPHU9uyC0gtQG5vpFLvgpeU4+zEAz2H8APHNw==`.
- `barlow/semibold.bin`: Barlow SemiBold font (TTF bytes, Pages binary-module extension). Source: https://github.com/google/fonts/tree/main/ofl/barlow. SIL Open Font License retained beside the font.

Original FranchiseHQ SVG layout and rating selection live outside these vendor directories. No AI generation, browser-rendering service, third-party sports platform code, added secret, or paid image binding is used at runtime.
