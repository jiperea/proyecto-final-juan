import { describe, it, expect } from 'vitest';
import { createLogger } from '../../src/infra/logger';

// FR-017/S-003/S-006: title/description de Order (PII de cliente) nunca en logs (feliz ni error).
describe('redacción de logs de Order (FR-017)', () => {
  it('title/description salen [Redacted] tanto en info como en error, top-level y anidado', () => {
    const lines: string[] = [];
    const logger = createLogger({
      stream: {
        write: (s: string) => {
          lines.push(s);
        },
      },
    });
    logger.info(
      { title: 'CLIENTE_PII_1', description: 'DIRECCION_PII_1', order: { title: 'CLIENTE_PII_2', description: 'DIRECCION_PII_2' } },
      'listado',
    );
    logger.error({ err: 'boom', order: { title: 'CLIENTE_PII_3', description: 'DIRECCION_PII_3' } }, 'fallo');
    // Forma REAL de la respuesta listOrders: { orders: [{ title, description }] } (I-001)
    logger.info({ orders: [{ title: 'CLIENTE_PII_4', description: 'DIRECCION_PII_4' }] }, 'respuesta');
    logger.error({ res: { orders: [{ title: 'CLIENTE_PII_5', description: 'DIRECCION_PII_5' }] } }, 'error-payload');
    const out = lines.join('');
    for (const pii of [
      'CLIENTE_PII_1', 'DIRECCION_PII_1', 'CLIENTE_PII_2', 'DIRECCION_PII_2', 'CLIENTE_PII_3',
      'DIRECCION_PII_3', 'CLIENTE_PII_4', 'DIRECCION_PII_4', 'CLIENTE_PII_5', 'DIRECCION_PII_5',
    ]) {
      expect(out).not.toContain(pii);
    }
    expect(out).toContain('[Redacted]');
  });
});
