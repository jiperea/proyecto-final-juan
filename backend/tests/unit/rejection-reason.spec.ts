// T008 (008/#010, US1) — ciclo vigente + "rechazo SIN atender" (FR-003, D2). Puro, sin BD.
import { describe, it, expect } from 'vitest';
import { unattendedRejectionReason } from '../../src/domain/order/read-side/rejection-reason';
import type { OrderDetailSnapshot } from '../../src/domain/order/read-side/ports';
import type { OrderRecord } from '../../src/domain/order/model';

const ORDER: OrderRecord = {
  id: 'o1',
  title: 't',
  description: 'd',
  status: 'in_progress',
  assignedTo: 'tech-1',
  version: 3,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

function snap(over: Partial<OrderDetailSnapshot>): OrderDetailSnapshot {
  return {
    order: ORDER,
    lastSubmit: null,
    lastReject: null,
    notes: null,
    evidenceContentTypes: [],
    ...over,
  };
}

describe('unattendedRejectionReason (FR-003)', () => {
  it('sin rechazo nunca → null', () => {
    expect(unattendedRejectionReason(snap({ lastReject: null }))).toBeNull();
  });

  it('reject posterior al último submit → muestra el motivo', () => {
    const r = unattendedRejectionReason(
      snap({
        lastSubmit: { id: 'a1', at: new Date('2026-07-02T10:00:00Z') },
        lastReject: { id: 'a2', at: new Date('2026-07-02T11:00:00Z'), reason: 'faltan fotos' },
      }),
    );
    expect(r).toBe('faltan fotos');
  });

  it('ya reenviada (submit posterior al reject) → omite el motivo', () => {
    const r = unattendedRejectionReason(
      snap({
        lastSubmit: { id: 'a3', at: new Date('2026-07-02T12:00:00Z') },
        lastReject: { id: 'a2', at: new Date('2026-07-02T11:00:00Z'), reason: 'faltan fotos' },
      }),
    );
    expect(r).toBeNull();
  });

  it('multi-ciclo: elige la ÚLTIMA reject (posterior al último submit)', () => {
    // El reader ya entrega la última reject y el último submit; aquí se verifica la regla temporal.
    const r = unattendedRejectionReason(
      snap({
        lastSubmit: { id: 'sub-2', at: new Date('2026-07-05T09:00:00Z') },
        lastReject: { id: 'rej-2', at: new Date('2026-07-05T10:00:00Z'), reason: 'segundo rechazo' },
      }),
    );
    expect(r).toBe('segundo rechazo');
  });

  it('empate de `at`: desempata por uuid v7 (reject id mayor → posterior → muestra)', () => {
    const at = new Date('2026-07-02T11:00:00Z');
    const shown = unattendedRejectionReason(
      snap({
        lastSubmit: { id: '018f0000-0000-7000-8000-000000000001', at },
        lastReject: { id: '018f0000-0000-7000-8000-000000000002', at, reason: 'reject tras submit' },
      }),
    );
    expect(shown).toBe('reject tras submit');

    const hidden = unattendedRejectionReason(
      snap({
        lastSubmit: { id: '018f0000-0000-7000-8000-000000000002', at },
        lastReject: { id: '018f0000-0000-7000-8000-000000000001', at, reason: 'submit tras reject' },
      }),
    );
    expect(hidden).toBeNull();
  });

  it('reject sin ningún submit → sin atender (muestra)', () => {
    const r = unattendedRejectionReason(
      snap({
        lastSubmit: null,
        lastReject: { id: 'a2', at: new Date('2026-07-02T11:00:00Z'), reason: 'motivo' },
      }),
    );
    expect(r).toBe('motivo');
  });
});
