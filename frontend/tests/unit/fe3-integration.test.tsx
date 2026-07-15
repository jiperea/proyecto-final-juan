import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';
import { renderApp } from '../test-utils';
import { setViewportWide } from '../viewport';
import { server } from '../../mocks/server';

// SC-001 · integración del camino feliz en OrderDetailView (dispatcher, escritorio).
const OID = '00000000-0000-7000-8000-00000000ac01';
const DEST = '33333333-3333-4333-8333-333333333333';
const DISP = { id: '00000000-0000-7000-8000-000000000009', email: 'd@x.test', username: 'dis', role: 'dispatcher' as const };

afterEach(() => setViewportWide(false));

describe('FE-3 · integración OrderDetailView (SC-001)', () => {
  it('dispatcher reasigna → anuncia el nuevo asignatario y cierra el formulario', async () => {
    setViewportWide(true);
    server.use(
      http.post(`/v1/auth/refresh`, () => HttpResponse.json({ access_token: 't', user: DISP })),
      http.get(`/v1/auth/me`, () => HttpResponse.json({ user: DISP })),
      http.get(`/v1/orders/:id`, () =>
        HttpResponse.json({
          order: { id: OID, title: 'Reparar', description: 'd', status: 'assigned', assigned_to: null, version: 0, created_at: 'x', updated_at: 'y' },
        }),
      ),
      http.post(`/v1/orders/:id/reassignments`, async ({ request }) => {
        const b = (await request.json()) as { assignee_id: string };
        return HttpResponse.json(
          { id: OID, title: 'Reparar', description: 'd', status: 'assigned', assigned_to: b.assignee_id, version: 1, created_at: 'x', updated_at: 'z' },
          { status: 200 },
        );
      }),
    );
    renderApp(<OrderDetailView orderId={OID} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Reasignar' }));
    fireEvent.change(await screen.findByLabelText('Técnico destino'), { target: { value: DEST } });
    fireEvent.change(screen.getByLabelText('Motivo de la reasignación'), { target: { value: 'Cambio de zona' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));

    // Región viva anuncia el destino; el formulario se cierra (vuelve el botón Reasignar).
    expect(await screen.findByText(`Orden reasignada a ${DEST}`)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByLabelText('Motivo de la reasignación')).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Reasignar' })).toBeInTheDocument();
  });

  it('404 al reasignar (orden ya no reasignable) → limpia el detalle (estado no disponible) (FR-008)', async () => {
    setViewportWide(true);
    let gone = false; // tras el 404, la orden deja de ser visible para el dispatcher
    server.use(
      http.post(`/v1/auth/refresh`, () => HttpResponse.json({ access_token: 't', user: DISP })),
      http.get(`/v1/auth/me`, () => HttpResponse.json({ user: DISP })),
      http.get(`/v1/orders/:id`, () =>
        gone
          ? HttpResponse.json({ code: 'NOT_FOUND', message: 'x' }, { status: 404 })
          : HttpResponse.json({
              order: { id: OID, title: 'Reparar', description: 'd', status: 'assigned', assigned_to: null, version: 0, created_at: 'x', updated_at: 'y' },
            }),
      ),
      http.post(`/v1/orders/:id/reassignments`, () => {
        gone = true;
        return HttpResponse.json({ code: 'NOT_FOUND', message: 'x' }, { status: 404 });
      }),
    );
    renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reasignar' }));
    fireEvent.change(await screen.findByLabelText('Técnico destino'), { target: { value: DEST } });
    fireEvent.change(screen.getByLabelText('Motivo de la reasignación'), { target: { value: 'Cambio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));

    // El detalle se limpia (estado final estable): mensaje uniforme de no-disponible y sin el
    // formulario obsoleto (el detalle refetch-ea a 404 y desmonta el form).
    await waitFor(() => {
      expect(screen.queryByLabelText('Motivo de la reasignación')).not.toBeInTheDocument();
      expect(screen.getByText(/no existe o no está disponible/i)).toBeInTheDocument();
    });
  });
});
