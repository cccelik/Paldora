import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { callableNames } from './callable-names.js';

// index.ts initializes Firebase Admin on import, so read its exports statically.
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const exported = [...source.matchAll(/^export const (\w+) = onCall\(/gm)].map(
  ([, name]) => name,
);

describe('callableNames', () => {
  it('lists every onCall export exactly once, in source order', () => {
    expect(exported.length).toBeGreaterThan(0);
    expect(exported).toEqual([...callableNames]);
  });

  it('has no duplicates', () => {
    expect(new Set(callableNames).size).toBe(callableNames.length);
  });
});
