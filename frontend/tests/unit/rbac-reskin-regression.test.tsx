import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';
import { renderApp } from '../test-utils';
import { setViewportWide } from '../viewport';
import { server } from '../../mocks/server';

// FR-015/SC-010 · regresión RBAC del reskin: para cada combinación rol×estado, los controles condicionados
// siguen ocultos/visibles igual que antes del reskin. (El backend sigue siendo la autoridad; esto verifica
// el espejo de UI.)
const OID = '018f2000-0000-7000-8000-00000000abcd';
type Role = 'technician' | 'dispatcher' | 'supervisor';

function session(role: Role) {
  const u = { id: '018f1000-0000-7000-8000-000000000009', email: 'x@x.test', username: 'u', role };
  server.use(
    http.post(`/v1/auth/refresh`, () => HttpResponse.json({ access_token: 't', user: u })),
    http.get(`/v1/auth/me`, () => HttpResponse.json({ user: u })),
  );
}
function order(status: string) {
  server.use(
    http.get(`/v1/orders/:id`, () =>
      HttpResponse.json({
        order: { id: OID, title: 'O', description: 'd', status, assigned_to: null, version: 0, created_at: 'x', updated_at: 'y' },
      }),
    ),
  );
}
async function mounted() {
  await waitFor(() => expect(screen.getByRole('heading', { name: 'O' })).toBeInTheDocument());
}

afterEach(() => setViewportWide(false));

describe('regresión RBAC del reskin (rol × estado)', () => {
  it('dispatcher: «Reasignar» visible en assigned e in_progress', async () => {
    for (const status of ['assigned', 'in_progress']) {
      setViewportWide(true);
      session('dispatcher');
      order(status);
      const { unmount } = renderApp(<OrderDetailView orderId={OID} />);
      expect(await screen.findByRole('button', { name: 'Reasignar' })).toBeInTheDocument();
      unmount();
    }
  });

  it.each(['pending_review', 'closed'])('dispatcher: «Reasignar» ausente en %s', async (status) => {
    setViewportWide(true);
    session('dispatcher');
    order(status);
    renderApp(<OrderDetailView orderId={OID} />);
    await mounted();
    expect(screen.queryByRole('button', { name: 'Reasignar' })).not.toBeInTheDocument();
  });

  it('supervisor: «Aprobar»/«Rechazar» solo en pending_review (escritorio)', async () => {
    setViewportWide(true);
    session('supervisor');
    order('pending_review');
    renderApp(<OrderDetailView orderId={OID} />);
    expect(await screen.findByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
  });

  it('supervisor: sin controles de revisión en closed', async () => {
    setViewportWide(true);
    session('supervisor');
    order('closed');
    renderApp(<OrderDetailView orderId={OID} />);
    await mounted();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });

  it('technician: acciones propias por estado; nunca ve «Reasignar»/«Aprobar»', async () => {
    // assigned → puede iniciar trabajo
    setViewportWide(false);
    session('technician');
    order('assigned');
    const a = renderApp(<OrderDetailView orderId={OID} />);
    await mounted();
    expect(screen.getByRole('region', { name: 'Acciones de la orden' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reasignar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
    a.unmount();

    // in_progress → puede registrar ejecución
    session('technician');
    order('in_progress');
    renderApp(<OrderDetailView orderId={OID} />);
    await mounted();
    expect(screen.getByRole('heading', { name: 'Registrar ejecución' })).toBeInTheDocument();
  });
});
