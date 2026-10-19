import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Nest boots real HTTP servers in platform tests.
    testTimeout: 15_000,
  },
});
