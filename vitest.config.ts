import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/shared/{assistant,environment,guidance,impact,planner,upstream}.ts',
        'src/server/{app,gemini}.ts',
        'src/client/data.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 98, statements: 94, branches: 89, functions: 93 },
    },
  },
});
