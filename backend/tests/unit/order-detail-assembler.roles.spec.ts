// T020 (008/#010, US2) — ensamblador por rol: supervisor (notes+evidence, sin motivo) y dispatcher
// (mínimo privilegio, sin notes/evidence/motivo). FR-002/FR-005. Puro.
import { describe, it, expect } from 'vitest';
import { assembleOrderDetail } from '../../src/domain/order/read-side/order-detail-assembler';
import type { OrderDetailSnapshot, PiiRedactorPort } from '../../src/domain/order/read-side/ports';
import type { OrderRecord } from '../../src/domain/order/model';

const ORDER: OrderRecord = {
  id: 'o1',
  title: 't',
  description: 'd',
  status: 'pending_review',
  assignedTo: 'tech-1',
  version: 3,
  createdAt: new Date('2026-07-01T00:00:00Z'),
  updatedAt: new Date('2026-07-01T00:00:00Z'),
};

const redactor: PiiRedactorPort = { redact: (t) => t };

const SNAP: OrderDetailSnapshot = {
  order: ORDER,
  lastSubmit: { id: 'sub-1', at: new Date('2026-07-02T10:00:00Z') },
  lastReject: { id: 'rej-1', at: new Date('2026-07-02T09:00:00Z'), reason: 'motivo previo' },
  notes: 'notas del técnico',
  evidenceContentTypes: ['image/jpeg'],
  evidenceItems: [{ id: 'ev-1', contentType: 'image/jpeg' }],
};

describe('assembleOrderDetail — supervisor/dispatcher (FR-002/FR-005)', () => {
  it('supervisor: notes + evidence, SIN last_rejection_reason', () => {
    const view = assembleOrderDetail({ role: 'supervisor', snapshot: SNAP, redactor });
    expect(view.notes).toBe('notas del técnico');
    expect(view.evidence).toEqual({
      count: 1,
      contentTypes: ['image/jpeg'],
      items: [{ id: 'ev-1', contentType: 'image/jpeg' }],
    });
    expect('lastRejectionReason' in view).toBe(false);
  });

  it('dispatcher: mínimo privilegio → solo order (sin notes/evidence/motivo)', () => {
    const view = assembleOrderDetail({ role: 'dispatcher', snapshot: SNAP, redactor });
    expect('notes' in view).toBe(false);
    expect('evidence' in view).toBe(false);
    expect('lastRejectionReason' in view).toBe(false);
    expect(view.order).toBe(ORDER);
  });
});
