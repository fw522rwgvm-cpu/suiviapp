import { defineConfig } from 'drizzle-kit';

// Migrations are generated, versioned and applied at startup (D6).
// driver: 'expo' makes drizzle-kit emit a migrations.js bundling every .sql
// as a string, because React Native has no filesystem to read them from.
export default defineConfig({
  schema: './src/core/db/schema/index.ts',
  out: './src/core/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
});
