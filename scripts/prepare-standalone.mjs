// Copies static assets into the standalone server folder, as `output: 'standalone'` requires
// (https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
import { cpSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const standalone = new URL('.next/standalone/', root);

if (!existsSync(standalone)) {
  console.error('.next/standalone not found — run `next build` first.');
  process.exit(1);
}

cpSync(new URL('.next/static/', root), new URL('.next/static/', standalone), { recursive: true });
if (existsSync(new URL('public/', root))) {
  cpSync(new URL('public/', root), new URL('public/', standalone), { recursive: true });
}
console.log('Standalone server ready: node .next/standalone/server.js');
