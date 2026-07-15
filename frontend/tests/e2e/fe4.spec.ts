import { expect, test, type Page } from '@playwright/test';

// T017 (SC-001) · e2e del camino feliz del supervisor: pedir resumen IA → aprobar con confirmación.
// Backend mockeado por contrato (page.route), mock STATEFUL (el estado avanza pending_review→closed).
const SUP = { id: 's1', email: 'sup@x.test', username: 'sup', role: 'supervisor' };

function order(status: string, version: number) {
  return {
    order: { id: 'o1', title: 'Reparar caldera', description: 'desc', status, assigned_to: 't1', version, created_at: '2026-07-15T00:00:00Z', updated_at: '2026-07-15T00:00:00Z' },
    notes: 'Sustituida la válvula.',
    evidence: { count: 1, content_types: ['image/jpeg'] },
  };
}

async function mockBackend(page: Page) {
  const state = { status: 'pending_review', version: 0 };
  await page.route('**/v1/auth/refresh', (r) => r.fulfill({ json: { access_token: 't', user: SUP } }));
  await page.route('**/v1/auth/me', (r) => r.fulfill({ json: { user: SUP } }));
  await page.route('**/v1/orders', (r) => r.fulfill({ json: { orders: [order(state.status, state.version).order] } }));
  await page.route('**/v1/orders/o1/ai-summary', (r) =>
    r.fulfill({ json: { sufficient: true, summary: 'La incidencia: válvula sustituida y probada.' } }),
  );
  await page.route('**/v1/orders/o1/review', (r) => {
    state.status = 'closed';
    state.version += 1;
    return r.fulfill({ json: order(state.status, state.version).order });
  });
  await page.route(/\/v1\/orders\/o1(\?.*)?$/, (r) => r.fulfill({ json: order(state.status, state.version) }));
}

test('camino feliz: supervisor pide resumen y aprueba con confirmación (SC-001)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); // escritorio (FR-015)
  await mockBackend(page);
  await page.goto('/orders/o1');

  await expect(page.getByRole('heading', { name: 'Reparar caldera' })).toBeVisible();

  // Resumen IA bajo demanda.
  await page.getByRole('button', { name: 'Resumir con IA' }).click();
  await expect(page.getByText('La incidencia: válvula sustituida y probada.')).toBeVisible();

  // Aprobar → alertdialog de confirmación → Confirmar.
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar' }).click();

  // Reflejado sin recarga: anuncio de aprobada/cerrada.
  await expect(page.getByText(/aprobada y cerrada/i)).toBeVisible();
});
