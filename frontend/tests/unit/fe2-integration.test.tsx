import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';

const OID = '00000000-0000-7000-8000-0000000000bb';
const TECH = {
  id: '00000000-0000-7000-8000-000000000001',
  email: 'ana@fieldops.test',
  username: 'ana',
  role: 'technician' as const,
};

function orderWith(status: string) {
  return {
    order: {
      id: OID,
      title: 'Orden',
      description: 'desc',
      status,
      assigned_to: TECH.id,
      version: 0,
      created_at: '2026-07-14T00:00:00Z',
      updated_at: '2026-07-14T00:00:00Z',
    },
  };
}

describe('FE-2 · integración en OrderDetailView (por estado y rol)', () => {
  it('technician + assigned → ofrece Iniciar trabajo (SC-001)', async () => {
    server.use(http.get(`/v1/orders/:id`, () => HttpResponse.json(orderWith('assigned'))));
    renderApp(<OrderDetailView orderId={OID} />);
    expect(await screen.findByRole('button', { name: /Iniciar trabajo/ })).toBeInTheDocument();
  });

  it('technician + in_progress → muestra el formulario de ejecución; envío del camino feliz (SC-002)', async () => {
    server.use(http.get(`/v1/orders/:id`, () => HttpResponse.json(orderWith('in_progress'))));
    renderApp(<OrderDetailView orderId={OID} />);
    const notes = await screen.findByLabelText('Notas de la ejecución');
    const enviar = screen.getByRole('button', { name: /Enviar a revisión/ });
    expect(enviar).toBeDisabled(); // sin notas ni foto
    fireEvent.change(notes, { target: { value: 'Trabajo realizado en sitio' } });
    fireEvent.change(screen.getByLabelText('Añadir foto'), {
      target: { files: [new File([new Uint8Array(1)], 'foto.jpg', { type: 'image/jpeg' })] },
    });
    expect(enviar).toBeEnabled();
    fireEvent.click(enviar);
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('422 al enviar (estado cambió) → error mapeado SIN perder notas ni foto (AC2.6, FR-009)', async () => {
    server.use(
      http.get(`/v1/orders/:id`, () => HttpResponse.json(orderWith('in_progress'))),
      http.post(`/v1/orders/:id/execution`, () =>
        HttpResponse.json({ code: 'INVALID_TRANSITION', message: 'x' }, { status: 422 }),
      ),
    );
    renderApp(<OrderDetailView orderId={OID} />);
    const notes = await screen.findByLabelText('Notas de la ejecución');
    fireEvent.change(notes, { target: { value: 'trabajo hecho' } });
    fireEvent.change(screen.getByLabelText('Añadir foto'), {
      target: { files: [new File([new Uint8Array(1)], 'f.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar a revisión/ }));
    // error mapeado del contrato visible
    expect(await screen.findByRole('alert')).toHaveTextContent(/cambiado de estado/i);
    // datos preservados: las notas y la foto siguen ahí
    expect(screen.getByLabelText('Notas de la ejecución')).toHaveValue('trabajo hecho');
    expect(screen.getByRole('img')).toBeInTheDocument();
  });

  it('rol NO technician (dispatcher) → NO ofrece acciones write (FR-007, K-004)', async () => {
    server.use(
      http.get(`/v1/auth/me`, () => HttpResponse.json({ user: { ...TECH, role: 'dispatcher' } })),
      http.post(`/v1/auth/refresh`, () =>
        HttpResponse.json({ access_token: 't', user: { ...TECH, role: 'dispatcher' } }),
      ),
      http.get(`/v1/orders/:id`, () => HttpResponse.json(orderWith('assigned'))),
    );
    renderApp(<OrderDetailView orderId={OID} />);
    // el detalle carga (título visible) pero nunca aparece Iniciar/Enviar
    expect(await screen.findByRole('heading', { name: 'Orden' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Iniciar trabajo|Enviar a revisión/ })).not.toBeInTheDocument(),
    );
  });
});
