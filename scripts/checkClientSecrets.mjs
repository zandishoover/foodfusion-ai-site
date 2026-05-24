import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const excludedDirectories = new Set(['.expo', '.git', 'dist', 'node_modules', 'Pods', 'build']);
const excludedFiles = new Set(['scripts/checkClientSecrets.mjs', 'server/recipeMcpBridge.mjs']);
const prohibitedPublicNames = [
  'EXPO_PUBLIC_OPENAI_API_KEY',
  'EXPO_PUBLIC_SUPABASE_SECRET_KEY',
  'EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY'
];
const secretPatterns = [
  { label: 'OpenAI API key literal', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { label: 'Supabase secret key literal', pattern: /\bsb_secret_[A-Za-z0-9_-]+\b/ },
  { label: 'Supabase service role assignment', pattern: /^\s*(?:EXPO_PUBLIC_)?SUPABASE_SERVICE_ROLE_KEY\s*=/m }
];
const scannableExtensions = new Set(['.js', '.mjs', '.json', '.md', '.sql', '.plist', '.example', '.local', '.env']);
const findings = [];

async function scanDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) {
      continue;
    }
    const filePath = path.join(directory, entry.name);
    const relativePath = path.relative(root, filePath);
    if (entry.isDirectory()) {
      await scanDirectory(filePath);
      continue;
    }
    if (excludedFiles.has(relativePath)) {
      continue;
    }
    if (!scannableExtensions.has(path.extname(entry.name)) && !entry.name.startsWith('.env')) {
      continue;
    }
    const source = await readFile(filePath, 'utf8');
    for (const name of prohibitedPublicNames) {
      if (source.includes(name)) {
        findings.push(`${relativePath}: prohibited mobile environment variable ${name}`);
      }
    }
    for (const { label, pattern } of secretPatterns) {
      if (pattern.test(source)) {
        findings.push(`${relativePath}: ${label}`);
      }
    }
  }
}

await scanDirectory(root);

if (findings.length > 0) {
  console.error('Client secret audit failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exitCode = 1;
} else {
  console.log('Client secret audit passed: no private OpenAI or elevated Supabase keys found in app files.');
}
