import { describe, expect, it } from 'vitest';
import { orderedPair } from './blocks.js';

describe('orderedPair', () => {
  const low = '0a7c1d6e-2f13-4d8b-9f54-5c3e6d1b7a22';
  const high = '7d2f4f3e-8a71-4c55-9b16-2f1f0c6d2a10';

  it('puts the smaller ID first whichever way round it is asked', () => {
    expect(orderedPair(low, high)).toEqual([low, high]);
    expect(orderedPair(high, low)).toEqual([low, high]);
  });

  it('matches PostgreSQL’s uuid ordering for lowercase IDs', () => {
    // The friendships check constraint compares uuids bytewise; lowercase hex
    // strings sort identically, which is why IDs are lowercased at the edge.
    expect([high, low].sort()).toEqual([low, high]);
  });
});
