import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';
import { renderApp } from '../test-utils';
import { setViewportWide } from '../viewport';
import { server } from '../../mocks/server';

// FR-001/FR-018 · el control de reasignar solo existe para dispatcher, en estado reasignable y en escritorio.
const OID = '00000000-0000-7000-8000-0000000000ee';

function user(role: 'dispatcher' | 'technician' | 'supervisor') {
  return { id: '00000000-0000-7000-8000-000000000009', email: 'd@x.test', username: 'dis', role };
}
function session(role: 'dispatcher' | 'technician' | 'supervisor') {
  server.use(
    http.post(`/v1/auth/refresh`, () => HttpResponse.json({ access_token: 't', user: user(role) })),
    http.get(`/v1/auth/me`, () => HttpResponse.json({ user: user(role) })),
  );
}
function order(status = 'assigned') {
  server.use(
    http.get(`/v1/orders/:id`, () =>
      HttpResponse.json({
        order: { id: OID, title: 'O', description: 'd', status, assigned_to: null, version: 0, created_at: 'x', updated_at: 'y' },
      }),
    ),
  );
}

afterEach(() => setViewportWide(false));

describe('FE-3 · ocultación por rol y viewport (SC-004)', () => {
  it('dispatcher + escritorio + reasignable → ofrece Reasignar', async () => {
    setViewportWide(true);
    session('dispatcher');
    order('assigned');
    renderApp(<OrderDetailView orderId={OID} />);
    expect(await screen.findByRole('button', { name: 'Reasignar' })).toBeInTheDocument();
  });

  it('dispatcher pero por debajo del breakpoint → NO ofrece Reasignar (FR-018)', async () => {
    setViewportWide(false);
    session('dispatcher');
    order('assigned');
    renderApp(<OrderDetailView orderId={OID} />);
    expect(await screen.findByRole('heading', { name: 'O' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reasignar' })).not.toBeInTheDocument();
  });

  it.each(['technician', 'supervisor'] as const)('%s en escritorio → NO ve Reasignar', async (role) => {
    setViewportWide(true);
    session(role);
    order('assigned');
    renderApp(<OrderDetailView orderId={OID} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'O' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Reasignar' })).not.toBeInTheDocument();
  });

  it('dispatcher + estado NO reasignable (pending_review) → NO ofrece Reasignar', async () => {
    setViewportWide(true);
    session('dispatcher');
    order('pending_review');
    renderApp(<OrderDetailView orderId={OID} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'O' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Reasignar' })).not.toBeInTheDocument();
  });
});
