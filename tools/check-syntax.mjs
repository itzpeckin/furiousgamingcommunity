import { spawnSync } from 'node:child_process';
import { readText, walkFiles } from './lib/project.mjs';

const files = (await walkFiles()).filter(file => file.endsWith('.js') || file.endsWith('.mjs'));
const failures = [];

for (const file of files) {
  const source = await readText(file);
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {
    input: source,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024
  });
  if (result.error) {
    console.error(`Syntax checker could not start Node for ${file}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    failures.push({ file, detail: String(result.stderr || result.stdout || 'Unknown parse error').trim() });
  }
}

if (failures.length) {
  console.error(`Syntax check failed for ${failures.length} file(s).`);
  for (const failure of failures) console.error(`- ${failure.file}: ${failure.detail}`);
  process.exit(1);
}

console.log(`Syntax check passed: ${files.length} JavaScript module(s).`);
