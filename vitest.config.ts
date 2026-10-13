import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // 'server-only' throws outside the React server condition; tests import server modules directly.
      'server-only': path.resolve(import.meta.dirname, 'tests/helpers/empty.ts'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/security/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // PGlite instances are memory-heavy; keep DB suites from all spinning up at once.
    maxWorkers: 4,
  },
})
