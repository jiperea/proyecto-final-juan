import { defineConfig } from 'vitest/config';

// Constitution VII: cobertura como gate duro por capa (dominio ≥80%, servicios ≥80%).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
    // unit: sin BD · integration/contract: BD real (docker-compose, BD de test)
    coverage: {
      provider: 'v8',
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/main.ts',
        'src/handlers/contract/types.ts',
        'src/handlers/http-types.ts',
        'src/infra/container.ts',
        'src/infra/prisma.ts',
        'src/domain/ports/**', // interfaces puras (sin lógica ejecutable)
      ],
      thresholds: {
        // Gate duro por capa (Constitution VII)
        'src/domain/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'src/handlers/**': { statements: 80, branches: 75, functions: 80, lines: 80 },
        'src/infra/**': { statements: 80, branches: 70, functions: 80, lines: 80 },
      },
    },
  },
});
