import path from 'node:path';
import { compareText, fileExists, readJson, readText, sha256, stableJson, walkFiles, writeText } from './lib/project.mjs';
import { functionRoutePath, requestHandlers } from './lib/routes.mjs';

const verify = process.argv.includes('--verify');
const packageJson = await readJson('package.json');
const excludedPrefixes = ['docs/generated/', 'releases/'];
const files = (await walkFiles()).filter(file => !excludedPrefixes.some(prefix => file.startsWith(prefix)));
const sourceFiles = files.filter(file => /\.(?:html|js|json|jsonc|mjs|sql|css)$/.test(file));
const functionFiles = files.filter(file => file.startsWith('functions/') && file.endsWith('.js'));
const migrationFiles = files.filter(file => /^migrations\/\d+_.+\.sql$/.test(file)).sort(compareText);

const routes = [];
const bindingUsage = new Map();
const storageKeys = new Map();
const frontendAssets = [];
const legacyMarkers = {
  FGC_APP: { occurrences: 0, files: new Set() },
  FGC_TRADE: { occurrences: 0, files: new Set() },
  ownerTb: { occurrences: 0, files: new Set() },
  hardCodedFgc: { occurrences: 0, files: new Set() },
  browserStorageCalls: { occurrences: 0, files: new Set() }
};
const largestFiles = [];

function record(map, key, file) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(file);
}

function recordMarker(marker, pattern, source, file) {
  const matches = source.match(pattern) || [];
  marker.occurrences += matches.length;
  if (matches.length) marker.files.add(file);
}

for (const file of sourceFiles) {
  const source = await readText(file);
  largestFiles.push({ file, bytes: Buffer.byteLength(source) });

  if (functionFiles.includes(file)) {
    const route = functionRoutePath(file);
    if (route) routes.push({ file, route, handlers: requestHandlers(source) });
  }

  if (file.startsWith('functions/') || file.startsWith('workers/')) {
    for (const match of source.matchAll(/\b(?:context\.)?env(?:\?\.|\.)([A-Z][A-Z0-9_]*)/g)) {
      record(bindingUsage, match[1], file);
    }
    for (const match of source.matchAll(/\b(?:context\.)?env\s*\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]/g)) {
      record(bindingUsage, match[1], file);
    }
  }

  for (const match of source.matchAll(/\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(\s*["']([^"']+)["']/g)) {
    record(storageKeys, match[1], file);
  }

  if (!file.startsWith('tools/') && !file.startsWith('tests/')) {
    recordMarker(legacyMarkers.FGC_APP, /\bFGC_APP\b/g, source, file);
    recordMarker(legacyMarkers.FGC_TRADE, /\bFGC_TRADE\b/g, source, file);
    recordMarker(legacyMarkers.ownerTb, /\bowner-tb\b/g, source, file);
    recordMarker(legacyMarkers.hardCodedFgc, /Furious Gaming Community|furiousgamingcommunity|furious-gaming-community/g, source, file);
    recordMarker(legacyMarkers.browserStorageCalls, /\b(?:localStorage|sessionStorage)\./g, source, file);
  }
}

const indexHtml = await readText('index.html');
for (const match of indexHtml.matchAll(/<(script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
  const reference = match[2];
  if (/^(?:https?:|data:|#|\/\/)/i.test(reference)) continue;
  frontendAssets.push({ type: match[1].toLowerCase(), path: reference.split(/[?#]/, 1)[0], versioned: /[?&]v=/.test(reference) });
}

const migrations = [];
for (const file of migrationFiles) {
  const source = await readText(file);
  migrations.push({
    file,
    version: file.match(/^migrations\/(\d+)_/)?.[1] || null,
    sha256: sha256(source),
    recordsLedger: /INSERT\s+(?:OR\s+REPLACE\s+)?INTO\s+schema_migrations/i.test(source)
  });
}

const extensionCounts = {};
for (const file of files) {
  const extension = path.posix.extname(file).toLowerCase() || '[none]';
  extensionCounts[extension] = (extensionCounts[extension] || 0) + 1;
}

const inventory = {
  schemaVersion: 1,
  product: 'FranchiseHQ',
  release: packageJson.version,
  scope: {
    excludedPrefixes,
    note: 'Generated inventory and release evidence are excluded so verification remains deterministic.'
  },
  files: {
    total: files.length,
    byExtension: extensionCounts,
    largest: largestFiles.sort((left, right) => right.bytes - left.bytes || compareText(left.file, right.file)).slice(0, 20)
  },
  frontend: {
    entrypoint: 'index.html',
    assets: frontendAssets,
    scriptCount: frontendAssets.filter(asset => asset.type === 'script').length,
    stylesheetCount: frontendAssets.filter(asset => asset.type === 'link').length
  },
  functions: {
    routeCount: routes.length,
    routes: routes.sort((left, right) => compareText(left.route, right.route) || compareText(left.file, right.file))
  },
  environmentBindings: Object.fromEntries(
    [...bindingUsage.entries()].sort(([left], [right]) => compareText(left, right)).map(([name, paths]) => [name, [...paths].sort(compareText)])
  ),
  browserStorage: {
    literalKeys: Object.fromEntries(
      [...storageKeys.entries()].sort(([left], [right]) => compareText(left, right)).map(([name, paths]) => [name, [...paths].sort(compareText)])
    )
  },
  migrations,
  legacyMarkers: Object.fromEntries(
    Object.entries(legacyMarkers).map(([name, value]) => [name, { occurrences: value.occurrences, files: [...value.files].sort(compareText) }])
  )
};

function markdown(data) {
  const bindingRows = Object.entries(data.environmentBindings)
    .map(([name, paths]) => `| \`${name}\` | ${paths.length} |`)
    .join('\n');
  const routeRows = data.functions.routes
    .map(route => `| \`${route.route}\` | ${route.handlers.map(name => `\`${name}\``).join(', ') || 'none'} | \`${route.file}\` |`)
    .join('\n');
  const migrationRows = data.migrations
    .map(item => `| ${item.version} | \`${item.file}\` | ${item.recordsLedger ? 'yes' : 'no'} |`)
    .join('\n');
  const legacyRows = Object.entries(data.legacyMarkers)
    .map(([name, item]) => `| ${name} | ${item.occurrences} | ${item.files.length} |`)
    .join('\n');
  const largestRows = data.files.largest
    .map(item => `| \`${item.file}\` | ${item.bytes.toLocaleString('en-US')} |`)
    .join('\n');

  return `# FranchiseHQ System Inventory\n\n` +
    `**Release:** ${data.release}\n` +
    `**Tracked files:** ${data.files.total}\n` +
    `**Function routes:** ${data.functions.routeCount}\n` +
    `**Frontend scripts:** ${data.frontend.scriptCount}\n\n` +
    `This file is generated by \`npm run inventory\`. Do not edit it by hand.\n\n` +
    `## Environment binding usage\n\n| Binding | Referencing files |\n|---|---:|\n${bindingRows}\n\n` +
    `## Pages Function routes\n\n| Route | Handlers | Source |\n|---|---|---|\n${routeRows}\n\n` +
    `## Migrations\n\n| Version | File | Writes migration ledger |\n|---:|---|---|\n${migrationRows}\n\n` +
    `## Legacy markers\n\n| Marker | Occurrences | Files |\n|---|---:|---:|\n${legacyRows}\n\n` +
    `## Largest source files\n\n| File | Bytes |\n|---|---:|\n${largestRows}\n`;
}

const jsonOutput = stableJson(inventory);
const markdownOutput = markdown(inventory);
const targets = [
  ['docs/generated/system-inventory.json', jsonOutput],
  ['docs/generated/system-inventory.md', markdownOutput]
];

if (verify) {
  const mismatches = [];
  for (const [file, expected] of targets) {
    if (!(await fileExists(file)) || await readText(file) !== expected) mismatches.push(file);
  }
  if (mismatches.length) {
    console.error(`Inventory is stale or missing: ${mismatches.join(', ')}. Run npm run inventory.`);
    process.exit(1);
  }
  console.log(`Inventory verification passed: ${inventory.files.total} tracked file(s), ${inventory.functions.routeCount} route(s).`);
} else {
  for (const [file, contents] of targets) await writeText(file, contents);
  console.log(`Inventory generated: ${inventory.files.total} tracked file(s), ${inventory.functions.routeCount} route(s).`);
}
