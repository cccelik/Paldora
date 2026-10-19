import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { apiRoutes, buildOpenApiDocument } from '../src/index.js';

const outputPath = fileURLToPath(
  new URL('../../../contracts/openapi.json', import.meta.url),
);
const document = buildOpenApiDocument(apiRoutes, {
  title: 'Paldora API',
  version: '1',
});
const serialized = `${JSON.stringify(document, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let committed = '';
  try {
    committed = readFileSync(outputPath, 'utf8');
  } catch {
    // Missing output is reported as drift below.
  }
  if (committed !== serialized) {
    console.error(
      'contracts/openapi.json is out of date. Run `pnpm contract:generate` and commit the result.',
    );
    process.exit(1);
  }
  console.log('contracts/openapi.json is up to date.');
} else {
  writeFileSync(outputPath, serialized);
  console.log('Wrote contracts/openapi.json.');
}
