// Downloads the backend OpenAPI spec into openapi/openapi.json (the committed contract snapshot).
// Usage: OPENAPI_URL=https://<backend>/api/docs-json pnpm api:fetch
import { writeFile } from 'node:fs/promises';

const DEFAULT_URL = 'https://dvsy-utility-backend-rk9l58-56f94b-13-140-149-47.sslip.io/api/docs-json';
const url = process.env.OPENAPI_URL ?? DEFAULT_URL;

const response = await fetch(url);
if (!response.ok) {
  console.error(`Failed to download ${url}: HTTP ${response.status}`);
  process.exit(1);
}
const spec = await response.json();
await writeFile(new URL('../openapi/openapi.json', import.meta.url), `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Saved OpenAPI ${spec.openapi} spec "${spec.info?.title}" from ${url}`);
