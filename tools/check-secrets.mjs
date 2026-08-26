import { lineNumber, readText, walkFiles } from './lib/project.mjs';

const scannedExtensions = new Set([
  '.env', '.html', '.js', '.json', '.jsonc', '.md', '.mjs', '.sql', '.toml', '.txt', '.yaml', '.yml'
]);
const files = (await walkFiles()).filter(file => {
  const extension = file.includes('.') ? `.${file.split('.').pop().toLowerCase()}` : '';
  return scannedExtensions.has(extension) && file !== '.dev.vars.example';
});

const rules = [
  { id: 'private-key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'github-token', pattern: /\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/g },
  { id: 'cloudflare-global-key', pattern: /\b[a-f0-9]{37}\b/gi },
  {
    id: 'literal-secret-assignment',
    pattern: /\b(?:DISCORD_CLIENT_SECRET|SESSION_SIGNING_SECRET|COMPANION_EXPORT_TOKEN|CLOUDFLARE_API_TOKEN|EA_DIRECT_ACCESS_TOKEN|EA_MADDEN_CLIENT_SECRET|API_TOKEN|PASSWORD)\b\s*[:=]\s*["']([^"']{12,})["']/gi,
    ignore(match) {
      return /(?:<|>|example|placeholder|replace|dummy|test-only|set-in-)/i.test(match[1]);
    }
  }
];

const findings = [];
for (const file of files) {
  const source = await readText(file);
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      if (rule.ignore?.(match)) continue;
      findings.push({ file, line: lineNumber(source, match.index), rule: rule.id });
    }
  }
}

if (findings.length) {
  console.error(`Secret scan failed with ${findings.length} high-confidence finding(s). Values are intentionally redacted.`);
  for (const finding of findings) console.error(`- ${finding.file}:${finding.line} (${finding.rule})`);
  process.exit(1);
}

console.log(`Secret scan passed: ${files.length} text file(s), no high-confidence credential literals.`);
