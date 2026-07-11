import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireRole } from '../../src/handlers/middleware/require-role';
import { jsonErrorHandler } from '../../src/handlers/error-mapper';
import type { AuthContext } from '../../src/handlers/http-types';
import '../../src/handlers/http-types';

function appWith(auth?: Partial<AuthContext>): express.Express {
  const app = express();
  app.get(
    '/x',
    (req, _res, next) => {
      if (auth) {
        req.auth = auth as AuthContext;
      }
      next();
    },
    requireRole('dispatcher', 'technician', 'supervisor'),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  app.use(jsonErrorHandler);
  return app;
}

describe('requireRole — allowlist default-deny (FR-006, S-001/S-004)', () => {
  it('rol en el allowlist → continúa (200)', async () => {
    const res = await request(appWith({ userId: 'u1', sessionId: 's', role: 'dispatcher' })).get('/x');
    expect(res.status).toBe(200);
  });

  it('rol fuera del allowlist → 403 con mensaje genérico (no enumera roles)', async () => {
    const res = await request(appWith({ userId: 'u1', sessionId: 's', role: 'ghost' as never })).get('/x');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('dispatcher');
    expect(serialized).not.toContain('ghost');
  });

  it('rol ausente/malformado → 403 (fail-secure)', async () => {
    const res = await request(appWith({ userId: 'u1', sessionId: 's', role: undefined as never })).get('/x');
    expect(res.status).toBe(403);
  });
});
