import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { IncidentSummaryPanel } from '../../src/features/orders/IncidentSummaryPanel';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';

const OID = '018f2000-0000-7000-8000-0000000000f2';

describe('FE-4 · IncidentSummaryPanel', () => {
  it('estado vacío: botón presente, sin resumen hasta pulsar', () => {
    renderApp(<IncidentSummaryPanel orderId={OID} />);
    expect(screen.getByRole('button', { name: 'Resumir con IA' })).toBeInTheDocument();
    expect(screen.queryByText('Resumen de la incidencia.')).not.toBeInTheDocument();
  });

  it('sufficient=true → muestra el summary', async () => {
    renderApp(<IncidentSummaryPanel orderId={OID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resumir con IA' }));
    expect(await screen.findByText('Resumen de la incidencia.')).toBeInTheDocument();
  });

  it('sufficient=false → mensaje honesto, sin texto de resumen (SC-005)', async () => {
    server.use(http.post(`/v1/orders/:id/ai-summary`, () => HttpResponse.json({ sufficient: false, summary: null })));
    renderApp(<IncidentSummaryPanel orderId={OID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resumir con IA' }));
    expect(await screen.findByText(/no hay material suficiente/i)).toBeInTheDocument();
  });

  it('429 → mensaje + botón deshabilitado (cooldown)', async () => {
    server.use(
      http.post(`/v1/orders/:id/ai-summary`, () =>
        HttpResponse.json({ code: 'RATE_LIMITED', message: 'x' }, { status: 429, headers: { 'Retry-After': '30' } }),
      ),
    );
    renderApp(<IncidentSummaryPanel orderId={OID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resumir con IA' }));
    // el mensaje incluye el Retry-After concreto (30 s)
    expect(await screen.findByRole('alert')).toHaveTextContent(/30 s/);
    // botón con aria-disabled (no `disabled` nativo → no pierde el foco)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Resumir con IA' })).toHaveAttribute('aria-disabled', 'true'),
    );
    expect(screen.getByRole('button', { name: 'Resumir con IA' })).not.toBeDisabled();
  });

  it('503 → estado error con reintento habilitado', async () => {
    server.use(http.post(`/v1/orders/:id/ai-summary`, () => HttpResponse.json({ code: 'SERVICE_UNAVAILABLE', message: 'x' }, { status: 503 })));
    renderApp(<IncidentSummaryPanel orderId={OID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resumir con IA' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resumir con IA' })).toBeEnabled();
  });
});
