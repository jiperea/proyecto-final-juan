import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authenticate } from '../../src/handlers/middleware/authenticate';
import { jsonErrorHandler } from '../../src/handlers/error-mapper';
import { JwtTokenIssuer } from '../../src/infra/crypto/token-issuer';
import type { SessionStatePort } from '../../src/domain/ports/services';

const issuer = new JwtTokenIssuer({ jwtSecret: 'j'.repeat(40), accessTtl: 900, refreshTtlDays: 7 });

function okState(over: Partial<SessionStatePort> = {}): SessionStatePort {
  return {
    isRevoked: async () => false,
    isUserActive: async () => true,
    revokeSession: () => undefined,
    ...over,
  };
}

function appWith(state: SessionStatePort): express.Express {
  const app = express();
  app.get('/p', authenticate(issuer, state), (req, res) => {
    res.json({ auth: req.auth });
  });
  app.use(jsonErrorHandler);
  return app;
}

function bearer(): string {
  return `Bearer ${issuer.issue({ sub: 'u1', sid: 's1', role: 'dispatcher' }).accessToken}`;
}

describe('authenticate middleware (FR-004c/007, D3)', () => {
  it('sin Authorization → 401', async () => {
    const res = await request(appWith(okState())).get('/p');
    expect(res.status).toBe(401);
  });

  it('token inválido → 401', async () => {
    const res = await request(appWith(okState())).get('/p').set('Authorization', 'Bearer basura');
    expect(res.status).toBe(401);
  });

  it('token válido + sesión vigente + cuenta activa → 200 con auth', async () => {
    const res = await request(appWith(okState())).get('/p').set('Authorization', bearer());
    expect(res.status).toBe(200);
    expect(res.body.auth).toEqual({ userId: 'u1', sessionId: 's1', role: 'dispatcher' });
  });

  it('sesión revocada → 401', async () => {
    const res = await request(appWith(okState({ isRevoked: async () => true })))
      .get('/p')
      .set('Authorization', bearer());
    expect(res.status).toBe(401);
  });

  it('cuenta disabled → 401', async () => {
    const res = await request(appWith(okState({ isUserActive: async () => false })))
      .get('/p')
      .set('Authorization', bearer());
    expect(res.status).toBe(401);
  });

  it('fail-closed: BD caída en cache-miss → 401 (nunca fail-open)', async () => {
    const res = await request(
      appWith(
        okState({
          isRevoked: async () => {
            throw new Error('db down');
          },
        }),
      ),
    )
      .get('/p')
      .set('Authorization', bearer());
    expect(res.status).toBe(401);
  });
});
