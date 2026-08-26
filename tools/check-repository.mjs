import { readJson, readText, walkFiles } from './lib/project.mjs';

const infrastructureRoots = [
  '.github/',
  'config/',
  'docs/',
  'releases/',
  'tests/',
  'tools/'
];
const rootFiles = new Set([
  '.editorconfig',
  '.gitignore',
  'package.json',
  'README.md',
  'RELEASE-PROCESS.md',
  'TESTING-RELEASE-HARDENING.md'
]);
const files = (await walkFiles()).filter(file =>
  rootFiles.has(file) || infrastructureRoots.some(root => file.startsWith(root))
);
const errors = [];

for (const file of files) {
  if (/\.(?:png|jpg|jpeg|gif|webp|zip)$/i.test(file)) continue;
  const source = await readText(file);
  if (/^(?:<{7}|={7}|>{7})/m.test(source)) errors.push(`${file} contains a merge-conflict marker.`);
  if (!source.endsWith('\n')) errors.push(`${file} must end with a newline.`);
  if (source.endsWith('\n\n')) errors.push(`${file} has an extra blank line at end of file.`);
  if (/\.(?:js|mjs|json|yml|yaml)$/.test(file) && /[ \t]+$/m.test(source)) {
    errors.push(`${file} contains trailing whitespace.`);
  }
  if (/C:\\Users\\|\/Users\/|\/home\//i.test(source)) {
    errors.push(`${file} contains a machine-specific absolute path.`);
  }
}

for (const file of files.filter(file => file.endsWith('.json'))) {
  try {
    await readJson(file);
  } catch (error) {
    errors.push(`${file} is not valid JSON: ${error.message}`);
  }
}

const packageJson = await readJson('package.json');
for (const script of ['check', 'check:strict', 'inventory', 'inventory:verify', 'test', 'ci']) {
  if (!packageJson.scripts?.[script]) errors.push(`package.json is missing script ${script}.`);
}

if (errors.length) {
  console.error(`Repository lint failed with ${errors.length} issue(s).`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Repository lint passed: ${files.length} engineering-baseline file(s).`);
