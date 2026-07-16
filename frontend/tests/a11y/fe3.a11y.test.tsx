import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from './axe-fieldops'; // FR-010: excepción AA acotada centralizada
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);
import { fireEvent, screen } from '@testing-library/react';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { setViewportWide } from '../viewport';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';

// SC-003: 0 violaciones de axe en los estados nuevos del dispatcher (form, error, en vuelo).
const OID = '00000000-0000-7000-8000-00000000ab01';
const DISP = { id: '00000000-0000-7000-8000-000000000009', email: 'd@x.test', username: 'dis', role: 'dispatcher' as const };

function setup(status = 'assigned') {
  setViewportWide(true);
  server.use(
    http.post(`/v1/auth/refresh`, () => HttpResponse.json({ access_token: 't', user: DISP })),
    http.get(`/v1/auth/me`, () => HttpResponse.json({ user: DISP })),
    http.get(`/v1/orders/:id`, () =>
      HttpResponse.json({
        order: { id: OID, title: 'O', description: 'd', status, assigned_to: null, version: 0, created_at: 'x', updated_at: 'y' },
      }),
    ),
  );
}

afterEach(() => setViewportWide(false));

describe('FE-3 · a11y (axe) del flujo de reasignación (SC-003)', () => {
  it('formulario de reasignación abierto: sin violaciones', async () => {
    setup('assigned');
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reasignar' }));
    await screen.findByLabelText('Técnico destino');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('formulario con errores de campo (ambos): sin violaciones', async () => {
    setup('assigned');
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reasignar' }));
    fireEvent.change(await screen.findByLabelText('Técnico destino'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    await screen.findAllByRole('alert');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('estado de éxito (región viva + foco en asignatario): sin violaciones', async () => {
    setup('assigned');
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reasignar' }));
    fireEvent.change(await screen.findByLabelText('Técnico destino'), {
      target: { value: '55555555-5555-4555-8555-555555555555' },
    });
    fireEvent.change(screen.getByLabelText('Motivo de la reasignación'), { target: { value: 'Cambio de zona' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reasignar' }));
    await screen.findByText(/Orden reasignada a/);
    expect(await axe(container)).toHaveNoViolations();
  });
});
