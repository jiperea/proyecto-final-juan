import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/handlers/app';

describe('ops health/ready (FR-015, contrato)', () => {
  it('GET /health → 200 { status: ok }', async () => {
    const res = await request(buildApp({ checkDb: async () => true })).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /ready → 200 ready cuando la BD responde', async () => {
    const res = await request(buildApp({ checkDb: async () => true })).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.checks.database).toBe('up');
  });

  it('GET /ready → 503 not_ready cuando la BD no responde (fail-closed)', async () => {
    const res = await request(buildApp({ checkDb: async () => false })).get('/ready');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('not_ready');
    expect(res.body.checks.database).toBe('down');
  });
});
