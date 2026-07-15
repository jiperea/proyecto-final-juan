import { expect, test, type Page } from '@playwright/test';

// T015 (SC-002) · e2e del CAMINO FELIZ del write-side del técnico: iniciar → notas → foto → enviar.
// Backend mockeado por contrato con page.route (sin backend real, igual que fe1.spec.ts). El mock es
// STATEFUL: el estado de la orden avanza assigned→in_progress→pending_review según las POST, y el GET del
// detalle refleja el estado vigente — que es lo que refetch-ea react-query al invalidar tras cada mutación.

const TECH = { id: 'u1', email: 'tec@x.test', username: 'tec', role: 'technician' };

// 1x1 PNG válido (metadato: content_type image/png, size_bytes ≥ 1) para setInputFiles.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

function makeOrder(status: string, version: number) {
  return {
    id: 'o1',
    title: 'Reparar caldera',
    description: 'Sustituir la válvula de seguridad.',
    status,
    assigned_to: TECH.id,
    version,
    created_at: '2026-07-14T00:00:00Z',
    updated_at: '2026-07-14T00:00:00Z',
  };
}

async function mockBackend(page: Page) {
  // Estado que avanza con las POST del técnico (fuente de verdad del mock).
  const state = { status: 'assigned', version: 0 };

  await page.route('**/v1/auth/refresh', (r) => r.fulfill({ json: { access_token: 't', user: TECH } }));
  await page.route('**/v1/auth/me', (r) => r.fulfill({ json: { user: TECH } }));
  await page.route('**/v1/orders', (r) =>
    r.fulfill({ json: { orders: [makeOrder(state.status, state.version)] } }),
  );

  // POST /start (assigned→in_progress) y POST /execution (in_progress→pending_review) devuelven el Order
  // directo (orderSchema); el GET del detalle lo envuelve en { order } (orderDetailResponseSchema).
  await page.route('**/v1/orders/o1/start', (r) => {
    state.status = 'in_progress';
    state.version += 1;
    return r.fulfill({ json: makeOrder(state.status, state.version) });
  });
  await page.route('**/v1/orders/o1/execution', (r) => {
    state.status = 'pending_review';
    state.version += 1;
    return r.fulfill({ json: makeOrder(state.status, state.version) });
  });
  // El detalle SIEMPRE refleja el estado vigente (debe ir después de las rutas más específicas /start,
  // /execution — Playwright evalúa los handlers en orden inverso al registro, así que este, registrado
  // el último, tiene prioridad; por eso se acota a la URL exacta con anclaje de query/fin).
  await page.route(/\/v1\/orders\/o1(\?.*)?$/, (r) =>
    r.fulfill({ json: { order: makeOrder(state.status, state.version) } }),
  );
}

test('camino feliz: iniciar → notas → foto → enviar a revisión (SC-002)', async ({ page }) => {
  await mockBackend(page);
  await page.goto('/orders/o1');

  // (1) Orden propia en `assigned`: se ofrece Iniciar trabajo.
  await expect(page.getByRole('heading', { name: 'Reparar caldera' })).toBeVisible();
  const iniciar = page.getByRole('button', { name: 'Iniciar trabajo' });
  await expect(iniciar).toBeVisible();

  // (2) Iniciar → in_progress en la misma pantalla (sin recarga): aparece el formulario de ejecución.
  await iniciar.click();
  await expect(page.getByRole('heading', { name: 'Registrar ejecución' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Iniciar trabajo' })).toHaveCount(0);

  // (3) Notas de la ejecución.
  await page.getByLabel('Notas de la ejecución').fill('Válvula sustituida y probada a presión. OK.');

  // (4) Evidencia: adjuntar una foto (metadato). Debe aparecer como ítem con nombre accesible.
  await page.getByLabel('Añadir foto').setInputFiles({
    name: 'evidencia.png',
    mimeType: 'image/png',
    buffer: PNG_1x1,
  });
  await expect(page.getByRole('img', { name: /Foto 1 de 1/ })).toBeVisible();

  // (5) Enviar a revisión → pending_review reflejado sin recarga (badge en la región viva).
  const enviar = page.getByRole('button', { name: 'Enviar a revisión' });
  await expect(enviar).toBeEnabled();
  await enviar.click();

  // El formulario desaparece (ya no está in_progress) y el badge pasa a «En revisión» (pending_review).
  await expect(page.getByRole('heading', { name: 'Registrar ejecución' })).toHaveCount(0);
  await expect(page.getByText('En revisión')).toBeVisible();
});
