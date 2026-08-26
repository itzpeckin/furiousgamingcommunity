import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function compareText(left, right) {
  const leftText = String(left);
  const rightText = String(right);
  if (leftText < rightText) return -1;
  if (leftText > rightText) return 1;
  return 0;
}

export function normalizeText(value) {
  return String(value).replace(/\r\n?/g, '\n');
}

const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.wrangler',
  'coverage',
  'dist',
  'node_modules'
]);

export function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

export async function walkFiles(start = ROOT, options = {}) {
  const files = [];
  const excluded = new Set([...EXCLUDED_DIRECTORIES, ...(options.excludedDirectories || [])]);

  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareText(left.name, right.name));
    for (const entry of entries) {
      // A normal checkout exposes .git as a directory, while a Git worktree
      // exposes it as a pointer file. Both are repository metadata and must be
      // excluded so generated evidence is identical on every checkout type.
      if (excluded.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
      } else if (entry.isFile()) {
        files.push(toPosix(path.relative(ROOT, absolute)));
      }
    }
  }

  await visit(start);
  return files;
}

export async function readText(relativePath) {
  const source = await fs.readFile(path.join(ROOT, relativePath), 'utf8');
  return normalizeText(source);
}

export async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

export async function fileExists(relativePath) {
  try {
    await fs.access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function lineNumber(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, item]) => [key, normalize(item)])
    );
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

export async function writeText(relativePath, contents) {
  const absolute = path.join(ROOT, relativePath);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, contents, 'utf8');
}
