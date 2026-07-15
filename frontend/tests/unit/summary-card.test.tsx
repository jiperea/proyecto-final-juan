import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { IncidentSummaryPanel } from '../../src/features/orders/IncidentSummaryPanel';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';

const OID = '018f2000-0000-7000-8000-0000000000f3';

// FR-008/S-002 · la tarjeta IA reestilada muestra el texto de guardián completo y renderiza EXACTAMENTE el
// summary recibido (sin transformar ni truncar). La minimización de PII es upstream (006/007) y no cambia.
describe('FE-5 · tarjeta de resumen IA (reskin)', () => {
  it('muestra la nota de guardián junto al resumen', async () => {
    renderApp(<IncidentSummaryPanel orderId={OID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resumir con IA' }));
    expect(await screen.findByText('Resumen de la incidencia.')).toBeInTheDocument();
    expect(screen.getByText(/no inventa el resumen/i)).toBeInTheDocument();
  });

  it('renderiza el summary completo (sin truncar) tal cual lo devuelve el backend', async () => {
    const long =
      'Sustituida la polea de tracción y engrasado el guiado; la cabina nivela correctamente. ' +
      'Queda como observación un ruido leve en la planta 2 que conviene revisar en la próxima visita.';
    server.use(http.post(`/v1/orders/:id/ai-summary`, () => HttpResponse.json({ sufficient: true, summary: long })));
    renderApp(<IncidentSummaryPanel orderId={OID} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resumir con IA' }));
    const node = await screen.findByText(long);
    // el texto renderizado es idéntico al prop de entrada (no se recorta ni transforma)
    expect(node.textContent).toBe(long);
  });
});
