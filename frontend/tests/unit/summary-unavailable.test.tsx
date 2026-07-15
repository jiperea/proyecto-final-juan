import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { IncidentSummaryPanel } from '../../src/features/orders/IncidentSummaryPanel';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';

const OID = '018f2000-0000-7000-8000-0000000000c4';

// 018/FR-003/SC-004 — ante code:AI_UNAVAILABLE (501), la UI muestra el mensaje de entorno, deshabilita el
// botón y NO ofrece reintento (estado terminal, distinto del 503 transitorio con "Reinténtalo").
describe('FE · resumen IA no disponible en este entorno (018)', () => {
  it('501 AI_UNAVAILABLE → mensaje de entorno + botón deshabilitado, sin reintento', async () => {
    server.use(
      http.post(`/v1/orders/:id/ai-summary`, () =>
        HttpResponse.json(
          { code: 'AI_UNAVAILABLE', message: 'El resumen por IA no está disponible en este entorno.' },
          { status: 501 },
        ),
      ),
    );
    renderApp(<IncidentSummaryPanel orderId={OID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resumir con IA' }));

    expect(await screen.findByText(/no está disponible en este entorno/i)).toBeInTheDocument();
    // No hay mensaje de reintento (no es un error transitorio).
    expect(screen.queryByText(/reinténtalo/i)).not.toBeInTheDocument();
    // El botón queda deshabilitado (no re-invita a un intento que fallará).
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resumir con IA' })).toBeDisabled());
  });
});
