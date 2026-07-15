import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';
import { renderApp } from '../test-utils';
import { setViewportWide } from '../viewport';
import { server } from '../../mocks/server';

const OID = '018f2000-0000-7000-8000-00000000ac10';
const SUP = { id: '018f1000-0000-7000-8000-000000000003', email: 's@x.test', username: 'sup', role: 'supervisor' as const };

function setup(status = 'pending_review') {
  setViewportWide(true);
  server.use(
    http.post(`/v1/auth/refresh`, () => HttpResponse.json({ access_token: 't', user: SUP })),
    http.get(`/v1/auth/me`, () => HttpResponse.json({ user: SUP })),
    http.get(`/v1/orders/:id`, () =>
      HttpResponse.json({
        order: { id: OID, title: 'O', description: 'd', status, assigned_to: null, version: 0, created_at: 'x', updated_at: 'y' },
        notes: 'n',
        evidence: { count: 1, content_types: ['image/jpeg'] },
      }),
    ),
  );
}

afterEach(() => setViewportWide(false));

describe('FE-4 · integración OrderDetailView (SC-001)', () => {
  it('aprobar (con confirmación) → anuncia el nuevo estado', async () => {
    setup('pending_review');
    server.use(
      http.post(`/v1/orders/:id/review`, () =>
        HttpResponse.json({ id: OID, title: 'O', description: 'd', status: 'closed', assigned_to: null, version: 1, created_at: 'x', updated_at: 'z' }),
      ),
    );
    renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar' }));
    expect(await screen.findByText(/aprobada y cerrada/i)).toBeInTheDocument();
  });

  it('FR-016: abrir el detalle NO llama a ai-summary automáticamente', async () => {
    setup('pending_review');
    let called = 0;
    server.use(http.post(`/v1/orders/:id/ai-summary`, () => { called += 1; return HttpResponse.json({ sufficient: true, summary: 's' }); }));
    renderApp(<OrderDetailView orderId={OID} />);
    await screen.findByRole('button', { name: 'Resumir con IA' });
    // pequeño margen para descartar una llamada automática en montaje
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resumir con IA' })).toBeEnabled());
    expect(called).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Resumir con IA' }));
    await waitFor(() => expect(called).toBe(1));
  });
});
