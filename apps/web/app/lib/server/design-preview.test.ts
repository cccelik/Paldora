import { designPreviewEnabled } from '@/lib/server/design-preview';
import { describe, expect, it } from 'vitest';

describe('designPreviewEnabled', () => {
  it('is on only for the local environment', () => {
    expect(designPreviewEnabled('local')).toBe(true);
    expect(designPreviewEnabled('staging')).toBe(false);
    expect(designPreviewEnabled('production')).toBe(false);
  });

  it('fails closed when the environment is missing or misspelled', () => {
    expect(designPreviewEnabled(undefined)).toBe(false);
    expect(designPreviewEnabled('prod')).toBe(false);
  });
});
