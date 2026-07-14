import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { OrderDetailView } from '../../src/features/orders/OrderDetailView';
import { renderApp } from '../test-utils';
import { server } from '../../mocks/server';
import { http, HttpResponse } from 'msw';

const OID = '00000000-0000-7000-8000-0000000000dd';
const NOTES = 'PII-secreta-del-cliente-en-notas';

afterEach(() => vi.restoreAllMocks());

// SC-006: notas (PII) y object_ref no deben aparecer en la consola/telemetría del front.
describe('FE-2 · no fuga de PII a consola (SC-006)', () => {
  it('no imprime las notas ni el object_ref en console durante el envío', async () => {
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
    ];
    server.use(http.get(`/v1/orders/:id`, () =>
      HttpResponse.json({
        order: {
          id: OID,
          title: 'Orden',
          description: 'desc',
          status: 'in_progress',
          assigned_to: '00000000-0000-7000-8000-000000000001',
          version: 0,
          created_at: '2026-07-14T00:00:00Z',
          updated_at: '2026-07-14T00:00:00Z',
        },
      }),
    ));
    renderApp(<OrderDetailView orderId={OID} />);
    const notes = await screen.findByLabelText('Notas de la ejecución');
    fireEvent.change(notes, { target: { value: NOTES } });
    fireEvent.change(screen.getByLabelText('Añadir foto'), {
      target: { files: [new File([new Uint8Array(1)], 'foto.jpg', { type: 'image/jpeg' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /Enviar a revisión/ }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());

    const allOutput = spies.flatMap((s) => s.mock.calls.flat()).map(String).join(' ');
    expect(allOutput).not.toContain(NOTES);
    expect(allOutput).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/); // ningún object_ref UUID
  });
});
