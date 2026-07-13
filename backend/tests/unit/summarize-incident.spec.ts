// T011 (US1) + T016 (US2) — caso de uso puro summarizeOrderIncident. Provider MOCK (vi.fn), sin red.
import { describe, expect, it, vi } from 'vitest';
import {
  summarizeOrderIncident,
  type SummarizeIncidentDeps,
} from '../../src/domain/ai/summarize-order-incident';
import type { IncidentSource, ProviderSummary } from '../../src/domain/ai/summary-ports';
import { domainError, err, ok, type DomainError, type Result } from '../../src/domain/result';

const THRESHOLDS = { minNotesChars: 30, minEvidence: 1 };

// Nota "rica" (≥30 chars no-whitespace) para superar el umbral FR-015.
const RICH_NOTES = 'El compresor de la unidad 4 no arranca; se sustituye el rele y queda operativo tras prueba.';
const SOURCE: IncidentSource = { notes: RICH_NOTES, evidence: { count: 2, contentTypes: ['image/jpeg', 'image/png'] } };

function depsWith(
  gen: (input: unknown) => Promise<Result<ProviderSummary | null, DomainError>>,
): { deps: SummarizeIncidentDeps; spy: ReturnType<typeof vi.fn> } {
  const spy = vi.fn(gen);
  return { deps: { provider: { generate: spy }, thresholds: THRESHOLDS }, spy };
}

describe('summarizeOrderIncident — US1 resumen fiel', () => {
  it('contenido suficiente + provider conforme → 200 sufficient=true con summary', async () => {
    const { deps, spy } = depsWith(() => Promise.resolve(ok({ summary: 'Resumen fiel.', sufficient: true })));
    const res = await summarizeOrderIncident(deps, { source: SOURCE });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toEqual({ summary: 'Resumen fiel.', sufficient: true, outcome: 'success' });
    }
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('minimiza PII estructurada ANTES del proveedor (FR-003b): el prompt lleva [REDACTED], no el valor', async () => {
    const notes = 'Cliente reporta averia recurrente; telefono de contacto +34 612 345 678 para seguimiento.';
    const { deps, spy } = depsWith(() => Promise.resolve(ok({ summary: 'ok.', sufficient: true })));
    await summarizeOrderIncident(deps, { source: { notes, evidence: { count: 1, contentTypes: ['image/png'] } } });
    const passed = spy.mock.calls[0]?.[0] as { notesRedacted: string };
    expect(passed.notesRedacted).toContain('[REDACTED]');
    expect(passed.notesRedacted).not.toContain('612 345 678');
  });
});

describe('summarizeOrderIncident — US2 fallback no-inventa', () => {
  it('umbral FR-015: notas crudas < 30 no-ws → fallback SIN llamar al proveedor', async () => {
    const { deps, spy } = depsWith(() => Promise.resolve(ok({ summary: 'x', sufficient: true })));
    const res = await summarizeOrderIncident(deps, {
      source: { notes: 'poco', evidence: { count: 3, contentTypes: ['image/png'] } },
    });
    expect(res.ok && res.value.outcome).toBe('fallback_insufficient');
    expect(spy).not.toHaveBeenCalled();
  });

  it('umbral FR-015: 0 evidencia → fallback SIN proveedor', async () => {
    const { deps, spy } = depsWith(() => Promise.resolve(ok({ summary: 'x', sufficient: true })));
    const res = await summarizeOrderIncident(deps, { source: { notes: RICH_NOTES, evidence: { count: 0, contentTypes: [] } } });
    expect(res.ok && res.value.sufficient).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('K4 control: nota ≥30 chars que incluye un teléfono NO dispara el corto-circuito (llama al proveedor)', async () => {
    const notes = 'Averia en el motor principal; contactar al +34 612 345 678 para coordinar la visita tecnica.';
    const { deps, spy } = depsWith(() => Promise.resolve(ok({ summary: 'ok.', sufficient: true })));
    const res = await summarizeOrderIncident(deps, { source: { notes, evidence: { count: 1, contentTypes: ['image/png'] } } });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(res.ok && res.value.outcome).toBe('success');
  });

  it('provider declara sufficient=false → fallback', async () => {
    const { deps } = depsWith(() => Promise.resolve(ok({ summary: '', sufficient: false })));
    const res = await summarizeOrderIncident(deps, { source: SOURCE });
    expect(res.ok && res.value).toEqual({ summary: null, sufficient: false, outcome: 'fallback_insufficient' });
  });

  it('H-003: salida no conforme como JSON (provider devuelve null) → fallback, NO error', async () => {
    const { deps } = depsWith(() => Promise.resolve(ok(null)));
    const res = await summarizeOrderIncident(deps, { source: SOURCE });
    expect(res.ok && res.value.outcome).toBe('fallback_insufficient');
  });

  it('salida vacía tras trim → fallback', async () => {
    const { deps } = depsWith(() => Promise.resolve(ok({ summary: '   ', sufficient: true })));
    const res = await summarizeOrderIncident(deps, { source: SOURCE });
    expect(res.ok && res.value.outcome).toBe('fallback_insufficient');
  });

  it('salida > 1200 caracteres (sin PII) → fallback_insufficient (FR-014)', async () => {
    const { deps } = depsWith(() => Promise.resolve(ok({ summary: 'a'.repeat(1201), sufficient: true })));
    const res = await summarizeOrderIncident(deps, { source: SOURCE });
    expect(res.ok && res.value).toEqual({ summary: null, sufficient: false, outcome: 'fallback_insufficient' });
  });

  it('salida con PII estructurada → blocked_pii (seguridad)', async () => {
    const { deps } = depsWith(() => Promise.resolve(ok({ summary: 'Ver DNI 12345678Z.', sufficient: true })));
    const res = await summarizeOrderIncident(deps, { source: SOURCE });
    expect(res.ok && res.value.outcome).toBe('blocked_pii');
  });

  it('K3/H-001 combinado: salida >1200 Y con PII → blocked_pii (PII gana)', async () => {
    const withPii = 'a'.repeat(1300) + ' email x@y.com';
    const { deps } = depsWith(() => Promise.resolve(ok({ summary: withPii, sufficient: true })));
    const res = await summarizeOrderIncident(deps, { source: SOURCE });
    expect(res.ok && res.value.outcome).toBe('blocked_pii');
  });

  it('provider timeout/fallo (err SERVICE_UNAVAILABLE) → Result err propagado (503)', async () => {
    const { deps } = depsWith(() => Promise.resolve(err(domainError('SERVICE_UNAVAILABLE', 'down'))));
    const res = await summarizeOrderIncident(deps, { source: SOURCE });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('SERVICE_UNAVAILABLE');
    }
  });
});
