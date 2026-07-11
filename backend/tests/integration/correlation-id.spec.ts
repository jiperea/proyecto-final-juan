import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/handlers/app';
import { createLogger } from '../../src/infra/logger';
import { minimalAppDeps } from '../helpers/fakes';

const app = buildApp(minimalAppDeps());

describe('correlation-id + redacción de logs (FR-014, S-001)', () => {
  it('devuelve el x-correlation-id proporcionado', async () => {
    const res = await request(app).get('/health').set('x-correlation-id', 'corr-test-123');
    expect(res.headers['x-correlation-id']).toBe('corr-test-123');
  });

  it('genera un x-correlation-id si no se envía', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('el logger redacta password/authorization/tokens/identifier (nunca PII ni secretos)', () => {
    const lines: string[] = [];
    const logger = createLogger({
      stream: {
        write: (s: string) => {
          lines.push(s);
        },
      },
    });
    logger.info(
      {
        password: 'SECRET_PW',
        authorization: 'Bearer XYZ',
        identifier: 'victim@example.com',
        refresh_token: 'RT_OPAQUE',
        access_token: 'AT_JWT',
        csrf_token: 'CS',
      },
      'evento',
    );
    const out = lines.join('');
    expect(out).not.toContain('SECRET_PW');
    expect(out).not.toContain('victim@example.com');
    expect(out).not.toContain('RT_OPAQUE');
    expect(out).not.toContain('AT_JWT');
    expect(out).toContain('[Redacted]');
  });
});
