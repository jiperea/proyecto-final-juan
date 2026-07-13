// T006 (008/#010, Foundational) — saneo de `recurso` + emisor best-effort (FR-009). (Red primero.)
import { describe, it, expect, vi } from 'vitest';
import type { Logger } from 'pino';
import {
  PinoDeniedAccessLogger,
  sanitizeResource,
} from '../../src/infra/audit/denied-access-logger';

describe('sanitizeResource (FR-009 — anti-inyección de PII)', () => {
  it('UUID canónico → se emite tal cual (identificador opaco)', () => {
    const id = '018f2000-0000-7000-8000-0000000000b2';
    expect(sanitizeResource(id)).toBe(id);
  });

  it('malformado / texto libre con posible PII → "<malformed>" (nunca crudo)', () => {
    expect(sanitizeResource('not-a-uuid')).toBe('<malformed>');
    expect(sanitizeResource('juan@example.com')).toBe('<malformed>');
    expect(sanitizeResource('')).toBe('<malformed>');
    expect(sanitizeResource('12345678-9012')).toBe('<malformed>');
  });
});

describe('PinoDeniedAccessLogger (FR-009 — best-effort)', () => {
  it('emite un warn con el evento (endpoint, recurso, outcome)', () => {
    const warn = vi.fn();
    const logger = new PinoDeniedAccessLogger({ warn } as unknown as Logger);
    logger.record({ endpoint: 'getOrderDetail', recurso: '<malformed>', outcome: '401_unauth' });
    expect(warn).toHaveBeenCalledOnce();
    const [payload] = warn.mock.calls[0]!;
    expect(payload).toMatchObject({ endpoint: 'getOrderDetail', outcome: '401_unauth' });
  });

  it('un fallo del logger NO propaga (no bloquea la respuesta)', () => {
    const logger = new PinoDeniedAccessLogger({
      warn: () => {
        throw new Error('logger KO');
      },
    } as unknown as Logger);
    expect(() =>
      logger.record({ actor: 'u1', endpoint: 'getOrderDetail', recurso: 'x', outcome: '404_not_visible' }),
    ).not.toThrow();
  });
});
