import { describe, it, expect } from 'vitest';
import { evaluateProbeAccess } from '../../src/domain/rbac/policy';

describe('política RBAC probe (FR-017/017b, D10) — orden rol(403)→pertenencia(404)', () => {
  it('technician → forbidden SIEMPRE (aun con id en alcance o inexistente)', () => {
    expect(evaluateProbeAccess('technician', ['dispatcher', 'supervisor'])).toBe('forbidden');
    expect(evaluateProbeAccess('technician', null)).toBe('forbidden');
  });

  it('dispatcher/supervisor con id en su alcance → allow', () => {
    expect(evaluateProbeAccess('dispatcher', ['dispatcher', 'supervisor'])).toBe('allow');
    expect(evaluateProbeAccess('supervisor', ['dispatcher', 'supervisor'])).toBe('allow');
  });

  it('dispatcher/supervisor fuera de alcance → not_found (no revela existencia)', () => {
    expect(evaluateProbeAccess('dispatcher', ['supervisor'])).toBe('not_found');
    expect(evaluateProbeAccess('supervisor', ['dispatcher'])).toBe('not_found');
  });

  it('id inexistente → not_found', () => {
    expect(evaluateProbeAccess('dispatcher', null)).toBe('not_found');
    expect(evaluateProbeAccess('supervisor', null)).toBe('not_found');
  });
});
