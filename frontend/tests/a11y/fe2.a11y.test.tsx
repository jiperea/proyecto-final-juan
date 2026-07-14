import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);
import { fireEvent, screen } from '@testing-library/react';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';

const OID = '00000000-0000-7000-8000-0000000000cc';
const base = {
  id: OID,
  title: 'Orden',
  description: 'desc',
  assigned_to: '00000000-0000-7000-8000-000000000001',
  version: 0,
  created_at: '2026-07-14T00:00:00Z',
  updated_at: '2026-07-14T00:00:00Z',
};

// SC-004: 0 violaciones de axe en las pantallas nuevas del técnico.
describe('FE-2 · a11y (axe) del formulario de ejecución (SC-004)', () => {
  it('formulario de ejecución con evidencia añadida: sin violaciones', async () => {
    server.use(http.get(`/v1/orders/:id`, () => HttpResponse.json({ order: { ...base, status: 'in_progress' } })));
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    await screen.findByLabelText('Notas de la ejecución');
    fireEvent.change(screen.getByLabelText('Añadir foto'), {
      target: { files: [new File([new Uint8Array(1)], 'foto.jpg', { type: 'image/jpeg' })] },
    });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('estado assigned (botón Iniciar) sin violaciones', async () => {
    server.use(http.get(`/v1/orders/:id`, () => HttpResponse.json({ order: { ...base, status: 'assigned' } })));
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    await screen.findByRole('button', { name: /Iniciar trabajo/ });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('estado de error de envío (422) sin violaciones', async () => {
    server.use(
      http.get(`/v1/orders/:id`, () => HttpResponse.json({ order: { ...base, status: 'in_progress' } })),
      http.post(`/v1/orders/:id/execution`, () =>
        HttpResponse.json({ code: 'INVALID_TRANSITION', message: 'x' }, { status: 422 }),
      ),
    );
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    const notes = await screen.findByLabelText('Notas de la ejecución');
    fireEvent.change(notes, { target: { value: 'trabajo' } });
    fireEvent.change(screen.getByLabelText('Añadir foto'), {
      target: { files: [new File([new Uint8Array(1)], 'f.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar a revisión/ }));
    await screen.findByRole('alert');
    expect(await axe(container)).toHaveNoViolations();
  });
});
