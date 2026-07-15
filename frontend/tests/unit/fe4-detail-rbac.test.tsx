import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';
import { renderApp } from '../test-utils';
import { setViewportWide } from '../viewport';
import { server } from '../../mocks/server';

// FR-001/015 · revisión + panel IA solo para supervisor, en pending_review y en escritorio.
const OID = '018f2000-0000-7000-8000-00000000ab10';

function user(role: 'supervisor' | 'technician' | 'dispatcher') {
  return { id: '018f1000-0000-7000-8000-000000000003', email: 's@x.test', username: 'sup', role };
}
function session(role: 'supervisor' | 'technician' | 'dispatcher') {
  server.use(
    http.post(`/v1/auth/refresh`, () => HttpResponse.json({ access_token: 't', user: user(role) })),
    http.get(`/v1/auth/me`, () => HttpResponse.json({ user: user(role) })),
  );
}
function order(status = 'pending_review') {
  server.use(
    http.get(`/v1/orders/:id`, () =>
      HttpResponse.json({
        order: { id: OID, title: 'O', description: 'd', status, assigned_to: null, version: 0, created_at: 'x', updated_at: 'y' },
        notes: 'notas del técnico',
        evidence: { count: 2, content_types: ['image/jpeg'] },
      }),
    ),
  );
}

afterEach(() => setViewportWide(false));

describe('FE-4 · ocultación por rol/viewport (SC-004)', () => {
  it('supervisor + pending_review + escritorio → ofrece Revisión y Resumir con IA', async () => {
    setViewportWide(true);
    session('supervisor');
    order('pending_review');
    renderApp(<OrderDetailView orderId={OID} />);
    expect(await screen.findByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resumir con IA' })).toBeInTheDocument();
  });

  it('supervisor bajo el breakpoint → aviso accesible, sin controles (FR-015)', async () => {
    setViewportWide(false);
    session('supervisor');
    order('pending_review');
    renderApp(<OrderDetailView orderId={OID} />);
    expect(await screen.findByText(/disponible en la versión de escritorio/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });

  it.each(['technician', 'dispatcher'] as const)('%s en escritorio → no ve revisión ni panel IA', async (role) => {
    setViewportWide(true);
    session(role);
    order('pending_review');
    renderApp(<OrderDetailView orderId={OID} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'O' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resumir con IA' })).not.toBeInTheDocument();
  });
});
