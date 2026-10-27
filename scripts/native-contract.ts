/**
 * Generates (or verifies with `--check`) the native callable contract:
 * `contracts/native/callables.schema.json`, derived from the Zod schemas in
 * `packages/validation/src/native`. Run through the validation package's tsx:
 * `pnpm contract:native:generate` / `pnpm contract:native:check`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { z } from 'zod';
import {
  NATIVE_RATE_LIMIT_WINDOW_MS,
  nativeBoxDocSchema,
  nativeBoxRefDocSchema,
  nativeCallableRegistry,
  NATIVE_ERROR_REASONS,
  nativeErrorSchema,
  nativeMemberDocSchema,
} from '../packages/validation/src/native/index.js';

const outputUrl = new URL(
  '../contracts/native/callables.schema.json',
  import.meta.url,
);
const outputPath = fileURLToPath(outputUrl);

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): unknown {
  const result = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'throw',
    reused: 'inline',
  }) as Record<string, unknown>;
  delete result.$schema;
  return result;
}

const document = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Paldora native callable contract',
  description:
    'Firebase callable functions (europe-west4). Generated from packages/validation/src/native; do not edit.',
  rateLimitWindowMs: NATIVE_RATE_LIMIT_WINDOW_MS,
  error: jsonSchema(nativeErrorSchema, 'output'),
  errorReasons: NATIVE_ERROR_REASONS,
  callables: Object.fromEntries(
    nativeCallableRegistry.map((entry) => [
      entry.name,
      {
        input: jsonSchema(entry.input, 'input'),
        output: jsonSchema(entry.output, 'output'),
        errors: entry.errors,
        limit: entry.limit,
      },
    ]),
  ),
  firestore: {
    'nativeAccounts/{uid}/boxRefs/{boxId}': jsonSchema(
      nativeBoxRefDocSchema,
      'output',
    ),
    'nativeBoxes/{boxId}': jsonSchema(nativeBoxDocSchema, 'output'),
    'nativeBoxes/{boxId}/members/{uid}': jsonSchema(
      nativeMemberDocSchema,
      'output',
    ),
  },
};

async function main(): Promise<void> {
  const options = (await resolveConfig(outputPath)) ?? {};
  const content = await format(JSON.stringify(document), {
    ...options,
    parser: 'json',
  });

  if (process.argv.includes('--check')) {
    let current = '';
    try {
      current = readFileSync(outputPath, 'utf8');
    } catch {
      // A missing file counts as stale.
    }
    if (current !== content) {
      console.error(
        'contracts/native/callables.schema.json is out of date. Run `pnpm contract:native:generate` and commit the result.',
      );
      process.exit(1);
    }
    console.log('Native callable contract is up to date.');
  } else {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, content);
    console.log('Generated contracts/native/callables.schema.json.');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
