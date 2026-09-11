import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run in plain Node, never on a device and never in CI on macOS.
// D15: what deserves a test is what produces a plausible but wrong result.
export default defineConfig({
  // Source modules import each other through the '@/' alias of tsconfig.json.
  // Vitest resolves nothing from tsconfig on its own, so without this line a
  // test importing any module that uses the alias fails to resolve — which
  // rules out exactly what D15 asks for: the access layer exercised against a
  // real SQLite file in Node.
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
