import { describe, it, expect } from 'vitest';
import { login, type LoginDeps } from '../../src/domain/auth/login';
import type { UserRecord } from '../../src/domain/model';
import { JwtTokenIssuer } from '../../src/infra/crypto/token-issuer';
import { InMemoryRateLimit } from '../../src/infra/ratelimit/in-memory';
import { fakeHasher, fakeRefreshTokens, fakeSessions, fakeUsers, fixedClock } from '../helpers/fakes';

const PW = 'SuperSecret123!';

function user(over: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'u1',
    email: 'a@b.com',
    username: 'alice',
    passwordHash: `hash:${PW}`,
    role: 'dispatcher',
    lockedUntil: null,
    disabledAt: null,
    ...over,
  };
}

function deps(users: LoginDeps['users']): LoginDeps {
  return {
    users,
    sessions: fakeSessions(),
    refreshTokens: fakeRefreshTokens(),
    hasher: fakeHasher((h, p) => h === `hash:${p}`),
    tokens: new JwtTokenIssuer({ jwtSecret: 'j'.repeat(40), accessTtl: 900, refreshTtlDays: 7 }),
    rateLimit: new InMemoryRateLimit({
      max: 5,
      windowMs: 900_000,
      lockoutMs: 900_000,
      lockoutSecret: 'l'.repeat(40),
    }),
    clock: fixedClock(1_000_000),
  };
}

describe('login use case (FR-001/002/002b/011, D4/D7)', () => {
  it('credenciales válidas → ok con identidad + tokens', async () => {
    const r = await login(deps(fakeUsers([user()])), { identifier: 'a@b.com', password: PW });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.identity.username).toBe('alice');
      expect(r.value.tokens.accessToken).toBeTruthy();
      expect(r.value.tokens.refreshTokenHash).toHaveLength(64);
    }
  });

  it('resuelve por username además de email', async () => {
    const r = await login(deps(fakeUsers([user()])), { identifier: 'ALICE', password: PW });
    expect(r.ok).toBe(true);
  });

  it('contraseña incorrecta → INVALID_CREDENTIALS (401)', async () => {
    const r = await login(deps(fakeUsers([user()])), {
      identifier: 'a@b.com',
      password: 'incorrecta-123',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('identifier inexistente → INVALID_CREDENTIALS (uniforme, no revela)', async () => {
    const r = await login(deps(fakeUsers([user()])), { identifier: 'nope@x.com', password: PW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('disabled + credenciales válidas → INVALID_CREDENTIALS (FR-002b)', async () => {
    const r = await login(deps(fakeUsers([user({ disabledAt: new Date() })])), {
      identifier: 'a@b.com',
      password: PW,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locked_until futuro → RATE_LIMITED (429)', async () => {
    const r = await login(deps(fakeUsers([user({ lockedUntil: new Date(2_000_000) })])), {
      identifier: 'a@b.com',
      password: PW,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('RATE_LIMITED');
  });

  it('5 fallos → el siguiente intento (aun válido) → RATE_LIMITED', async () => {
    const d = deps(fakeUsers([user()]));
    for (let i = 0; i < 5; i++) {
      await login(d, { identifier: 'a@b.com', password: 'incorrecta-123' });
    }
    const r = await login(d, { identifier: 'a@b.com', password: PW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('RATE_LIMITED');
  });

  it('BD caída → SERVICE_UNAVAILABLE (fail-closed, B3/H-003)', async () => {
    const base = deps(fakeUsers([user()]));
    const broken: LoginDeps = {
      ...base,
      users: {
        findByIdentifierNorm: async () => {
          throw new Error('db down');
        },
        findById: async () => null,
      },
    };
    const r = await login(broken, { identifier: 'a@b.com', password: PW });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
