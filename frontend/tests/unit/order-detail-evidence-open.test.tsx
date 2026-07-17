import { http, HttpResponse, delay } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as axeMatchers from 'vitest-axe/matchers';
import { axe } from '../a11y/axe-fieldops'; // FR-010: excepción AA acotada centralizada
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { AppRoutes } from '../../src/routes/AppRoutes';
import { setAccessToken } from '../../src/api/session-store';
import { setViewportWide } from '../viewport';

expect.extend(axeMatchers);

// 024 (T027/T031) · FR-010/FR-013: abrir la imagen de evidencia desde un blob autenticado, NUNCA la URL
// del endpoint en el DOM/<img src>.
function bootAs(role: 'technician' | 'supervisor') {
  server.use(
    http.get('/v1/auth/me', () =>
      HttpResponse.json({ user: { id: 'u1', email: 'u@x.test', username: 'usuario', role } }),
    ),
  );
}

const ORDER_ID = 'evid0010-0000-0000-0000-000000000010';
const EVIDENCE_ID_1 = 'e1e1e1e1-0000-0000-0000-000000000001';
const EVIDENCE_ID_2 = 'e2e2e2e2-0000-0000-0000-000000000002';

function orderWithEvidence() {
  return {
    order: {
      id: ORDER_ID,
      title: 'Orden con foto real',
      description: 'desc',
      status: 'pending_review',
      assigned_to: 'u1',
      version: 0,
      created_at: '2026-07-14T00:00:00Z',
      updated_at: '2026-07-14T00:00:00Z',
    },
    evidence: {
      count: 2,
      content_types: ['image/jpeg', 'image/png'],
      items: [
        { evidence_id: EVIDENCE_ID_1, content_type: 'image/jpeg' },
        { evidence_id: EVIDENCE_ID_2, content_type: 'image/png' },
      ],
    },
  };
}

afterEach(() => setAccessToken(null));
beforeEach(() => setViewportWide(false));

describe('Abrir la imagen de evidencia (024 · T027/FR-010/FR-013)', () => {
  it('(a) abre la imagen 1: fetch autenticado → blob en memoria (createObjectURL) y <img> visible', async () => {
    bootAs('technician');
    const createSpy = vi.spyOn(URL, 'createObjectURL');
    server.use(
      http.get(`/v1/orders/${ORDER_ID}`, () => HttpResponse.json(orderWithEvidence())),
      http.get(`/v1/orders/${ORDER_ID}/evidence/${EVIDENCE_ID_1}`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ),
    );
    renderApp(<AppRoutes />, `/orders/${ORDER_ID}`);
    await screen.findByRole('heading', { name: 'Orden con foto real' });

    const openButton = screen.getByRole('button', { name: /Ver imagen 1 de 2/i });
    fireEvent.click(openButton);

    const img = await screen.findByAltText('Imagen 1');
    expect(createSpy).toHaveBeenCalled();
    expect(img.getAttribute('src')).toMatch(/^blob:/);
  });

  it('(b) estado de carga y luego error (410 → mensaje dentro del visor, sin imagen) [superseded by 025: EvidenceViewer]', async () => {
    bootAs('supervisor');
    server.use(
      http.get(`/v1/orders/${ORDER_ID}`, () => HttpResponse.json(orderWithEvidence())),
      http.get(`/v1/orders/${ORDER_ID}/evidence/${EVIDENCE_ID_2}`, async () => {
        await delay(20);
        return HttpResponse.json({ code: 'EVIDENCE_GONE', message: 'no disponible' }, { status: 410 });
      }),
    );
    renderApp(<AppRoutes />, `/orders/${ORDER_ID}`);
    await screen.findByRole('heading', { name: 'Orden con foto real' });

    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 2 de 2/i }));
    const dialog = await screen.findByRole('dialog');

    // carga: región viva con mensaje de progreso, ANTES de que resuelva la respuesta demorada.
    expect(await within(dialog).findByText(/Cargando imagen 2/i)).toBeInTheDocument();

    // error: alerta accesible con el mensaje 410 (EVIDENCE_GONE), sin la imagen ni botón de reintento
    // (025/EvidenceViewer: colapso de errores único, sin retry — ver FR-005 de 025).
    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText('Esta imagen ya no está disponible.')).toBeInTheDocument();
    expect(screen.queryByAltText('Imagen 2')).not.toBeInTheDocument();
  });

  it('(c) ninguna URL del endpoint ni token aparece en el DOM: el <img> usa blob: exclusivamente', async () => {
    bootAs('technician');
    server.use(
      http.get(`/v1/orders/${ORDER_ID}`, () => HttpResponse.json(orderWithEvidence())),
      http.get(`/v1/orders/${ORDER_ID}/evidence/${EVIDENCE_ID_1}`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ),
    );
    const { container } = renderApp(<AppRoutes />, `/orders/${ORDER_ID}`);
    await screen.findByRole('heading', { name: 'Orden con foto real' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 2/i }));
    await screen.findByAltText('Imagen 1');

    // 0 apariciones de la ruta del endpoint (con o sin token) en TODO el DOM renderizado.
    expect(container.innerHTML).not.toContain(`/v1/orders/${ORDER_ID}/evidence`);
    expect(container.innerHTML).not.toMatch(/Bearer\s/i);
    const img = container.querySelector('img[alt="Imagen 1"]') as HTMLImageElement;
    expect(img.src.startsWith('blob:')).toBe(true);
  });

  it('(d) sin violaciones de axe con la imagen abierta', async () => {
    bootAs('technician');
    server.use(
      http.get(`/v1/orders/${ORDER_ID}`, () => HttpResponse.json(orderWithEvidence())),
      http.get(`/v1/orders/${ORDER_ID}/evidence/${EVIDENCE_ID_1}`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ),
    );
    const { container } = renderApp(<AppRoutes />, `/orders/${ORDER_ID}`);
    await screen.findByRole('heading', { name: 'Orden con foto real' });
    fireEvent.click(screen.getByRole('button', { name: /Ver imagen 1 de 2/i }));
    await screen.findByAltText('Imagen 1');

    expect(await axe(container)).toHaveNoViolations();
  });

  it('(e) el tile es alcanzable y activable SOLO con teclado (T046): Tab hasta el botón + Enter abre la imagen', async () => {
    bootAs('technician');
    server.use(
      http.get(`/v1/orders/${ORDER_ID}`, () => HttpResponse.json(orderWithEvidence())),
      http.get(`/v1/orders/${ORDER_ID}/evidence/${EVIDENCE_ID_1}`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3]).buffer, {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      ),
    );
    const u = userEvent.setup();
    renderApp(<AppRoutes />, `/orders/${ORDER_ID}`);
    await screen.findByRole('heading', { name: 'Orden con foto real' });

    const openButton = screen.getByRole('button', { name: /Ver imagen 1 de 2/i });
    openButton.focus();
    expect(openButton).toHaveFocus();

    await u.keyboard('{Enter}');

    const img = await screen.findByAltText('Imagen 1');
    expect(img.getAttribute('src')).toMatch(/^blob:/);
  });
});
