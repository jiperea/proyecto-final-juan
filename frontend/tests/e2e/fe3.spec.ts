import { expect, test, type Page } from '@playwright/test';

// T016 (SC-001) · e2e del CAMINO FELIZ del dispatcher: abrir orden reasignable → destino (UUID) + motivo
// → Reasignar → nuevo asignatario reflejado sin recarga. Backend mockeado por contrato (page.route),
// mock STATEFUL: el GET del detalle refleja el assigned_to vigente tras la POST de reasignación.

const DISPATCHER = { id: 'd1', email: 'dis@x.test', username: 'dis', role: 'dispatcher' };
const DEST = '44444444-4444-4444-8444-444444444444';

function order(assignedTo: string | null, version: number) {
  return {
    id: 'o1',
    title: 'Reparar caldera',
    description: 'Sustituir la válvula.',
    status: 'assigned',
    assigned_to: assignedTo,
    version,
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
  };
}

async function mockBackend(page: Page) {
  const state = { assignee: null as string | null, version: 0 };
  await page.route('**/v1/auth/refresh', (r) => r.fulfill({ json: { access_token: 't', user: DISPATCHER } }));
  await page.route('**/v1/auth/me', (r) => r.fulfill({ json: { user: DISPATCHER } }));
  await page.route('**/v1/orders', (r) => r.fulfill({ json: { orders: [order(state.assignee, state.version)] } }));
  await page.route('**/v1/orders/o1/reassignments', (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}');
    state.assignee = body.assignee_id ?? null;
    state.version += 1;
    return r.fulfill({ json: order(state.assignee, state.version) });
  });
  // El detalle refleja el estado vigente (registrado el último → mayor prioridad que /reassignments).
  await page.route(/\/v1\/orders\/o1(\?.*)?$/, (r) =>
    r.fulfill({ json: { order: order(state.assignee, state.version) } }),
  );
}

test('camino feliz: dispatcher reasigna en escritorio (SC-001)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); // escritorio (≥1024, FR-018)
  await mockBackend(page);
  await page.goto('/orders/o1');

  await expect(page.getByRole('heading', { name: 'Reparar caldera' })).toBeVisible();
  // Marca en window para detectar una recarga de documento (FR-003: "sin recarga completa").
  await page.evaluate(() => ((window as unknown as { __noReload?: boolean }).__noReload = true));
  await page.getByRole('button', { name: 'Reasignar' }).click();

  await page.getByLabel('Técnico destino').fill(DEST);
  await page.getByLabel('Motivo de la reasignación').fill('Cambio de zona');
  await page.getByRole('button', { name: 'Reasignar' }).click();

  // Resultado reflejado sin recarga: anuncio que nombra el destino + asignatario actualizado.
  await expect(page.getByText(`Orden reasignada a ${DEST}`)).toBeVisible();
  // FR-003: no hubo recarga completa de documento (la marca en window sobrevive).
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
});

test('FR-018: por debajo del breakpoint de escritorio el control de reasignar NO aparece', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 }); // móvil (<1024)
  await mockBackend(page);
  await page.goto('/orders/o1');
  await expect(page.getByRole('heading', { name: 'Reparar caldera' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reasignar' })).toHaveCount(0);
});
