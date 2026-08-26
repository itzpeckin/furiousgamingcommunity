import path from 'node:path';
import { fileExists, readText } from './lib/project.mjs';

const entrypoints = ['index.html'];
const failures = [];

for (const entrypoint of entrypoints) {
  const source = await readText(entrypoint);
  const references = new Set();
  const pattern = /<(?:script|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  for (const match of source.matchAll(pattern)) {
    const reference = match[1].trim();
    if (!reference || /^(?:https?:|data:|#|\/\/)/i.test(reference)) continue;
    const clean = reference.split(/[?#]/, 1)[0];
    if (!clean) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entrypoint), clean));
    references.add(resolved);
  }

  for (const reference of references) {
    if (reference.startsWith('../') || !(await fileExists(reference))) {
      failures.push(`${entrypoint} references missing or unsafe asset ${reference}.`);
    }
  }
}

if (failures.length) {
  console.error('HTML asset check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`HTML asset check passed: ${entrypoints.length} entrypoint(s).`);
