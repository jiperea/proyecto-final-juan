// T009 (008/#010, US1) — ensamblador technician + fail-closed del redactor (FR-001/002/003/006). Puro.
import { describe, it, expect } from 'vitest';
import { assembleOrderDetail } from '../../src/domain/order/read-side/order-detail-assembler';
import type { OrderDetailSnapshot, PiiRedactorPort } from '../../src/domain/order/read-side/ports';
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

const identityRedactor: PiiRedactorPort = { redact: (t) => t };
const throwingRedactor: PiiRedactorPort = {
  redact: () => {
    throw new Error('redactor KO');
  },
};

function snap(over: Partial<OrderDetailSnapshot> = {}): OrderDetailSnapshot {
  return {
    order: ORDER,
    lastSubmit: { id: 'sub-1', at: new Date('2026-07-02T10:00:00Z') },
    lastReject: { id: 'rej-1', at: new Date('2026-07-02T11:00:00Z'), reason: 'faltan fotos' },
    notes: 'notas del técnico',
    evidenceContentTypes: ['image/jpeg', 'image/png'],
    evidenceItems: [
      { id: 'ev-1', contentType: 'image/jpeg' },
      { id: 'ev-2', contentType: 'image/png' },
    ],
    ...over,
  };
}

describe('assembleOrderDetail — technician (FR-001/002/003/006)', () => {
  it('motivo saneado presente; notas + evidencia del ciclo; count == content_types.length', () => {
    const view = assembleOrderDetail({ role: 'technician', snapshot: snap(), redactor: identityRedactor });
    expect(view.notes).toBe('notas del técnico');
    expect(view.evidence).toEqual({
      count: 2,
      contentTypes: ['image/jpeg', 'image/png'],
      items: [
        { id: 'ev-1', contentType: 'image/jpeg' },
        { id: 'ev-2', contentType: 'image/png' },
      ],
    });
    expect(view.evidence?.count).toBe(view.evidence?.contentTypes.length);
    expect(view.lastRejectionReason).toBe('faltan fotos');
  });

  it('invoca el redactor sobre el motivo (saneo al leer)', () => {
    const calls: string[] = [];
    const spy: PiiRedactorPort = {
      redact: (t) => {
        calls.push(t);
        return '[REDACTED]';
      },
    };
    const view = assembleOrderDetail({ role: 'technician', snapshot: snap(), redactor: spy });
    expect(calls).toEqual(['faltan fotos']);
    expect(view.lastRejectionReason).toBe('[REDACTED]');
  });

  it('fail-closed: si el redactor lanza → OMITE last_rejection_reason (nunca el crudo)', () => {
    const view = assembleOrderDetail({ role: 'technician', snapshot: snap(), redactor: throwingRedactor });
    expect(view.lastRejectionReason).toBeUndefined();
    expect('lastRejectionReason' in view).toBe(false);
  });

  it('sin ciclo → evidence {count:0,content_types:[]}, notes omitida, sin motivo', () => {
    const view = assembleOrderDetail({
      role: 'technician',
      snapshot: snap({
        lastSubmit: null,
        lastReject: null,
        notes: null,
        evidenceContentTypes: [],
        evidenceItems: [],
      }),
      redactor: identityRedactor,
    });
    expect(view.evidence).toEqual({ count: 0, contentTypes: [], items: [] });
    expect('notes' in view).toBe(false);
    expect('lastRejectionReason' in view).toBe(false);
  });

  it('rechazo ya atendido (submit posterior) → motivo omitido', () => {
    const view = assembleOrderDetail({
      role: 'technician',
      snapshot: snap({
        lastSubmit: { id: 'sub-2', at: new Date('2026-07-02T12:00:00Z') },
        lastReject: { id: 'rej-1', at: new Date('2026-07-02T11:00:00Z'), reason: 'faltan fotos' },
      }),
      redactor: identityRedactor,
    });
    expect('lastRejectionReason' in view).toBe(false);
  });
});
