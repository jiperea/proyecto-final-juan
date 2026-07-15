import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { ReviewActions } from '../../src/features/orders/ReviewActions';
import { IncidentSummaryPanel } from '../../src/features/orders/IncidentSummaryPanel';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';

// FR-012/SC-006 · reason y summary no se emiten a consola ni se persisten en storage.
const OID = '018f2000-0000-7000-8000-00000000ad10';
const REASON = 'motivo-de-rechazo-sensible';
const SUMMARY = 'resumen-ia-sensible-de-la-incidencia';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('FE-4 · no-fuga de reason/summary (FR-012/SC-006)', () => {
  it('reason (rechazo) y summary (IA) no aparecen en consola ni storage', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
      vi.spyOn(console, m as 'log').mockImplementation(() => {}),
    );
    server.use(
      http.post(`/v1/orders/:id/review`, () =>
        HttpResponse.json({ id: OID, title: 'O', description: 'd', status: 'in_progress', assigned_to: null, version: 1, created_at: 'x', updated_at: 'y' }),
      ),
      http.post(`/v1/orders/:id/ai-summary`, () => HttpResponse.json({ sufficient: true, summary: SUMMARY })),
    );

    renderApp(<ReviewActions orderId={OID} evidenceCount={2} onReviewed={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rechazar' }));
    fireEvent.change(await screen.findByLabelText('Motivo del rechazo'), { target: { value: REASON } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar rechazo' }));

    renderApp(<IncidentSummaryPanel orderId={OID} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Resumir con IA' })[0]!);
    await screen.findByText(SUMMARY);

    await waitFor(() => {
      const logged = spies.flatMap((s) => s.mock.calls.flat()).map(String).join(' ');
      expect(logged).not.toContain(REASON);
      expect(logged).not.toContain(SUMMARY);
    });
    const storage = JSON.stringify(localStorage) + JSON.stringify(sessionStorage);
    expect(storage).not.toContain(REASON);
    expect(storage).not.toContain(SUMMARY);
    spies.forEach((s) => s.mockRestore());
  });
});
