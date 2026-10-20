import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  emitCss,
  emitKotlin,
  emitRoomCss,
  emitSwift,
  emitTypeScript,
} from '../src/emit.js';
import { resolveTokens } from '../src/resolve.js';

const fromPackage = (path: string) =>
  fileURLToPath(new URL(`../${path}`, import.meta.url));

const source = JSON.parse(
  readFileSync(fromPackage('../../design/tokens/paldora.tokens.json'), 'utf8'),
) as Record<string, unknown>;
const tokens = resolveTokens(source);

const outputs: Record<string, string> = {
  'src/generated/tokens.ts': emitTypeScript(tokens),
  'generated/css/tokens.css': emitCss(tokens),
  'generated/css/room-themes.css': emitRoomCss(tokens),
  'generated/swift/PaldoraTokens.swift': emitSwift(tokens),
  'generated/kotlin/PaldoraTokens.kt': emitKotlin(tokens),
};

const check = process.argv.includes('--check');
const stale: string[] = [];
for (const [relativePath, content] of Object.entries(outputs)) {
  const path = fromPackage(relativePath);
  if (check) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      // Missing output counts as stale.
    }
    if (current !== content) stale.push(relativePath);
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

if (stale.length > 0) {
  console.error(
    `Generated tokens are out of date (${stale.join(', ')}). Run \`pnpm tokens:generate\` and commit the result.`,
  );
  process.exit(1);
}
console.log(check ? 'Generated tokens are up to date.' : 'Generated tokens.');
