import { defineConfig, devices } from '@playwright/test';

// E2E: teclado (SC-004), reflow 320px/zoom200 (SC-007), bfcache (FR-030), flujos por rol.
// Sirve el build de producción con `vite preview`; las llamadas /v1 se interceptan con page.route
// (mock), de modo que el e2e no necesita backend real (ese camino es la validación del quickstart).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
