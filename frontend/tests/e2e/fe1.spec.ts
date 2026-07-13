import { expect, test, type Page } from '@playwright/test';

// Mock de /v1/* (no requiere backend real). El e2e valida teclado/reflow/flujo en un navegador real.
const TECH = { id: 'u1', email: 'a@x.test', username: 'ana', role: 'technician' };
const ORDER = {
  id: 'o1',
  title: 'Reparar caldera',
  description: 'desc',
  status: 'assigned',
  assigned_to: null,
  version: 0,
  created_at: '2026-07-14T00:00:00Z',
  updated_at: '2026-07-14T00:00:00Z',
};

async function mockBackend(page: Page, opts: { authed?: boolean } = {}) {
  await page.route('**/v1/auth/refresh', (r) =>
    opts.authed
      ? r.fulfill({ json: { access_token: 't', user: TECH } })
      : r.fulfill({ status: 401, body: '' }),
  );
  await page.route('**/v1/auth/login', (r) => r.fulfill({ json: { access_token: 't', user: TECH } }));
  await page.route('**/v1/auth/me', (r) => r.fulfill({ json: { user: TECH } }));
  await page.route('**/v1/orders', (r) => r.fulfill({ json: { orders: [ORDER] } }));
  await page.route('**/v1/orders/o1', (r) => r.fulfill({ json: { order: ORDER } }));
}

test('login por teclado → listado (SC-001/SC-004)', async ({ page }) => {
  await mockBackend(page, { authed: false });
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  // Operable por teclado: tabular a los campos y enviar con Enter.
  await page.getByLabel('Usuario o email').fill('ana');
  await page.getByLabel('Contraseña').fill('secret');
  await page.getByRole('button', { name: 'Entrar' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Mis órdenes' })).toBeVisible();
  await expect(page.getByText('Reparar caldera')).toBeVisible();
});

test('skip-link visible al enfocar (WCAG 2.4.1)', async ({ page }) => {
  await mockBackend(page, { authed: true });
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Mis órdenes' })).toBeVisible();
  // WCAG 2.4.1: el skip-link es enfocable y se REVELA al enfocarse (oculto fuera de foco).
  const skip = page.getByRole('link', { name: 'Saltar al contenido' });
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
});

test('reflow a 320px sin scroll horizontal del body (SC-007)', async ({ page }) => {
  await mockBackend(page, { authed: true });
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Mis órdenes' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(overflow).toBe(true);
});
