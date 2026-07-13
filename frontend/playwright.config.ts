import { defineConfig, devices } from '@playwright/test';

// E2E: teclado (SC-004), reflow 320px/zoom200 (SC-007), bfcache (FR-030), flujos por rol.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5173' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
});
