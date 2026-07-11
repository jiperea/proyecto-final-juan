import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { meHandler } from '../../src/handlers/auth/me';
import { jsonErrorHandler } from '../../src/handlers/error-mapper';
import type { AuthContext } from '../../src/handlers/http-types';
import type { UserRecord } from '../../src/domain/model';
import { fakeUsers } from '../helpers/fakes';
import '../../src/handlers/http-types';

const user: UserRecord = {
  id: 'u1',
  email: 'a@b.com',
  username: 'alice',
  passwordHash: 'x',
  role: 'supervisor',
  lockedUntil: null,
  disabledAt: null,
};

function appWith(users: ReturnType<typeof fakeUsers>, auth?: AuthContext): express.Express {
  const app = express();
  app.get(
    '/me',
    (req, _res, next) => {
      if (auth) {
        req.auth = auth;
      }
      next();
    },
    meHandler(users),
  );
  app.use(jsonErrorHandler);
  return app;
}

describe('me handler (FR-006) — ramas defensivas', () => {
  it('sin req.auth → 401', async () => {
    const res = await request(appWith(fakeUsers([user]))).get('/me');
    expect(res.status).toBe(401);
  });

  it('auth con usuario inexistente → 401', async () => {
    const res = await request(
      appWith(fakeUsers([]), { userId: 'ghost', sessionId: 's', role: 'supervisor' }),
    ).get('/me');
    expect(res.status).toBe(401);
  });

  it('auth válido → 200 identidad', async () => {
    const res = await request(
      appWith(fakeUsers([user]), { userId: 'u1', sessionId: 's', role: 'supervisor' }),
    ).get('/me');
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'alice', role: 'supervisor' });
  });
});
