import { test, type Page } from '@playwright/test';

// FE-7 (021) · FR-006/SC-004 — genera las CAPTURAS de fidelidad del acento vivo (#DC5A24/#FF7A45) en las
// superficies sin texto (anillo de foco, punto del paso actual del Stepper, borde de selección), en claro y
// oscuro, en el viewport de cada rol. Las capturas van a `test-results/dual-accent/` para la APROBACIÓN
// HUMANA de fidelidad en G3/PR (el gate automatizado solo garantiza el AA). Mock de /v1/* (sin backend real).
//
// Cómo correrlo:  cd frontend && npx playwright test tests/e2e/dual-accent-screenshots.spec.ts
// (o con el Playwright MCP una vez aprobado). Requiere la app en preview (webServer del playwright.config).

const SUP = { id: 'u1', email: 's@x.test', username: 'sup', role: 'supervisor' };
const ORDER = {
  id: 'o1',
  title: 'Mantenimiento de ascensor',
  description: 'Revisión periódica de la unidad de tracción',
  status: 'pending_review',
  assigned_to: null,
  version: 0,
  created_at: '2026-07-14T00:00:00Z',
  updated_at: '2026-07-14T00:00:00Z',
};

async function mockBackend(page: Page) {
  await page.route('**/v1/auth/refresh', (r) => r.fulfill({ json: { access_token: 't', user: SUP } }));
  await page.route('**/v1/auth/me', (r) => r.fulfill({ json: { user: SUP } }));
  await page.route('**/v1/orders', (r) => r.fulfill({ json: { orders: [ORDER] } }));
  await page.route('**/v1/orders/o1', (r) =>
    r.fulfill({ json: { order: ORDER, notes: 'n', evidence: { count: 2, content_types: ['image/jpeg'] } } }),
  );
}

const DIR = 'test-results/dual-accent';

for (const theme of ['light', 'dark'] as const) {
  test(`capturas del acento vivo — tema ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem('fieldops.theme', t), theme);
    await mockBackend(page);

    // Escritorio (master-detail: dispatcher/supervisor) — borde de selección vivo + Stepper.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/orders');
    await page.getByRole('heading', { name: 'Mis órdenes' }).waitFor();
    await page.screenshot({ path: `${DIR}/${theme}-desktop-listado.png`, fullPage: true });

    await page.goto('/orders/o1');
    await page.getByRole('list', { name: 'Estado de la orden' }).waitFor();
    // Enfocar un control para exhibir el anillo de foco vivo.
    await page.keyboard.press('Tab');
    await page.screenshot({ path: `${DIR}/${theme}-desktop-detalle-stepper-foco.png`, fullPage: true });

    // Móvil (técnico en campo) — detalle con Stepper.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/orders/o1');
    await page.getByRole('list', { name: 'Estado de la orden' }).waitFor();
    await page.screenshot({ path: `${DIR}/${theme}-movil-detalle.png`, fullPage: true });
  });
}
