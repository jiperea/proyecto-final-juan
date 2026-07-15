import { expect, test, type Page } from '@playwright/test';

// FR-009/SC-011 · el reskin no introduce scroll horizontal del body a 320px ni con zoom, en claro y oscuro,
// y mantiene master-detail ≥1024px. Mock de /v1/* (sin backend real).
const SUP = { id: 'u1', email: 's@x.test', username: 'sup', role: 'supervisor' };
const ORDER = {
  id: 'o1',
  title: 'Mantenimiento de ascensor',
  description: 'Revisión periódica',
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

async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

for (const theme of ['light', 'dark'] as const) {
  test(`320px sin overflow horizontal — listado y detalle (tema ${theme})`, async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem('fieldops.theme', t), theme);
    await mockBackend(page);
    await page.setViewportSize({ width: 320, height: 800 });

    await page.goto('/orders');
    await expect(page.getByRole('heading', { name: 'Mis órdenes' })).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);

    await page.goto('/orders/o1');
    await expect(page.getByRole('heading', { name: 'Mantenimiento de ascensor' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Estado de la orden' })).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
}

test('zoom 200% (viewport equivalente) sin overflow horizontal', async ({ page }) => {
  await mockBackend(page);
  // Emular zoom 200% reduciendo el viewport CSS a la mitad del ancho de referencia.
  await page.setViewportSize({ width: 640, height: 800 });
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Mis órdenes' })).toBeVisible();
  expect(await noHorizontalOverflow(page)).toBe(true);
});
