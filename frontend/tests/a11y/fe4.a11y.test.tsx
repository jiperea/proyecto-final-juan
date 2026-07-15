import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);
import { fireEvent, screen } from '@testing-library/react';
import { server } from '../../mocks/server';
import { renderApp } from '../test-utils';
import { setViewportWide } from '../viewport';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';

// SC-003 · 0 violaciones axe en los estados nuevos del supervisor (acciones, alertdialog, panel IA).
const OID = '018f2000-0000-7000-8000-0000000ab401';
const SUP = { id: '018f1000-0000-7000-8000-000000000003', email: 's@x.test', username: 'sup', role: 'supervisor' as const };

function setup() {
  setViewportWide(true);
  server.use(
    http.post(`/v1/auth/refresh`, () => HttpResponse.json({ access_token: 't', user: SUP })),
    http.get(`/v1/auth/me`, () => HttpResponse.json({ user: SUP })),
    http.get(`/v1/orders/:id`, () =>
      HttpResponse.json({
        order: { id: OID, title: 'O', description: 'd', status: 'pending_review', assigned_to: null, version: 0, created_at: 'x', updated_at: 'y' },
        notes: 'n',
        evidence: { count: 1, content_types: ['image/jpeg'] },
      }),
    ),
  );
}

afterEach(() => setViewportWide(false));

describe('FE-4 · a11y (axe) del flujo de revisión (SC-003)', () => {
  it('detalle con acciones de revisión + panel IA: sin violaciones', async () => {
    setup();
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    await screen.findByRole('button', { name: 'Aprobar' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('alertdialog de confirmación abierto: sin violaciones', async () => {
    setup();
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await screen.findByRole('alertdialog');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('resumen IA mostrado: sin violaciones', async () => {
    setup();
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resumir con IA' }));
    await screen.findByText('Resumen de la incidencia.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('formulario de rechazo con error de validación: sin violaciones', async () => {
    setup();
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar rechazo' })); // motivo vacío → error
    await screen.findByRole('alert');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('resumen IA sin material (sufficient=false): sin violaciones', async () => {
    setup();
    server.use(http.post(`/v1/orders/:id/ai-summary`, () => HttpResponse.json({ sufficient: false, summary: null })));
    const { container } = renderApp(<OrderDetailView orderId={OID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resumir con IA' }));
    await screen.findByText(/no hay material suficiente/i);
    expect(await axe(container)).toHaveNoViolations();
  });
});
