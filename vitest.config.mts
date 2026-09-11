import { defineConfig } from 'vitest/config';

// Tests run in plain Node, never on a device and never in CI on macOS.
// D15: what deserves a test is what produces a plausible but wrong result.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
