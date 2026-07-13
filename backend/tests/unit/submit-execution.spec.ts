import { describe, it, expect, vi } from 'vitest';
import { submitExecution, type SubmitExecutionDeps } from '../../src/domain/order/write-side/submit-execution';
import type { EvidenceRefInput } from '../../src/domain/order/evidence';
import type { OrderRecord } from '../../src/domain/order/model';
import { ok, type Result } from '../../src/domain/result';

// T017 (005, US2) — caso de uso de dominio submitExecution (puro, puerto mockeado). Valida evidencia (reutiliza
// evidence.ts) ANTES que notas; devuelve la intención de escritura delegando en el puerto. No toca la BD.

const ORDER: OrderRecord = {
  id: '018f2000-0000-7000-8000-0000000000a1',
  title: 't',
  description: 'd',
  status: 'pending_review',
  assignedTo: '018f1000-0000-7000-8000-000000000002',
  version: 2,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const validEvidence: EvidenceRefInput[] = [
  { objectRef: 'ref/ok', contentType: 'image/jpeg', sizeBytes: 100 },
];

function deps(): { deps: SubmitExecutionDeps; submitSpy: ReturnType<typeof vi.fn> } {
  const submitSpy = vi.fn(async (): Promise<Result<OrderRecord>> => ok(ORDER));
  return { deps: { execution: { submitExecution: submitSpy } }, submitSpy };
}

const base = {
  orderId: ORDER.id,
  actorId: ORDER.assignedTo as string,
  notes: 'trabajo terminado sin incidencias',
};

describe('submitExecution (dominio, US2)', () => {
  it('payload válido → delega en el puerto y devuelve su Result', async () => {
    const { deps: d, submitSpy } = deps();
    const r = await submitExecution(d, { ...base, evidence: validEvidence });
    expect(r.ok).toBe(true);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy.mock.calls[0]?.[0]).toMatchObject({
      orderId: ORDER.id,
      actorId: base.actorId,
      notes: base.notes,
    });
  });

  it('0 evidencias → EVIDENCE_REQUIRED, sin tocar el puerto', async () => {
    const { deps: d, submitSpy } = deps();
    const r = await submitExecution(d, { ...base, evidence: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('EVIDENCE_REQUIRED');
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('evidencia inválida → INVALID_EVIDENCE, sin tocar el puerto', async () => {
    const { deps: d, submitSpy } = deps();
    const bad: EvidenceRefInput[] = [{ objectRef: 'x', contentType: 'text/plain', sizeBytes: 1 }];
    const r = await submitExecution(d, { ...base, evidence: bad });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_EVIDENCE');
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('evidencia se valida ANTES que notas: evidencia inválida + notas inválidas → INVALID_EVIDENCE', async () => {
    const { deps: d } = deps();
    const bad: EvidenceRefInput[] = [{ objectRef: 'x', contentType: 'text/plain', sizeBytes: 1 }];
    const r = await submitExecution(d, { ...base, notes: '', evidence: bad });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_EVIDENCE');
  });

  it('notas vacías (evidencia válida) → VALIDATION_ERROR, sin tocar el puerto', async () => {
    const { deps: d, submitSpy } = deps();
    const r = await submitExecution(d, { ...base, notes: '   ', evidence: validEvidence });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION_ERROR');
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('notas > 2000 code points → VALIDATION_ERROR', async () => {
    const { deps: d } = deps();
    const r = await submitExecution(d, { ...base, notes: 'a'.repeat(2001), evidence: validEvidence });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('VALIDATION_ERROR');
  });
});
