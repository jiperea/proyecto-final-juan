import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/handlers/app';
import { minimalAppDeps } from '../helpers/fakes';

const app = buildApp(minimalAppDeps());

describe('cabeceras de seguridad (FR-012)', () => {
  it('incluye HSTS, CSP default-src self, nosniff, frame DENY, referrer no-referrer', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('no expone x-powered-by', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
