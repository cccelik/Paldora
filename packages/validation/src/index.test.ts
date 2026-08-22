import { describe, expect, it } from 'vitest';
import { cursorPageSchema } from './index.js';

describe('cursorPageSchema', () => {
  it('applies a bounded default page size', () => {
    expect(cursorPageSchema.parse({})).toEqual({ limit: 20 });
    expect(() => cursorPageSchema.parse({ limit: 51 })).toThrow();
  });
});
