import { describe, it, expect } from 'vitest';
import { refresh, type RefreshDeps } from '../../src/domain/auth/refresh';
import type { SessionStatePort } from '../../src/domain/ports/services';
import type { UserRecord } from '../../src/domain/model';
import { JwtTokenIssuer } from '../../src/infra/crypto/token-issuer';
import { InMemoryGraceCache } from '../../src/infra/grace-cache/in-memory';
import {
  fakeAccountState,
  fakeRefreshTokens,
  fakeSessions,
  fakeUsers,
  fixedClock,
} from '../helpers/fakes';

const T = 1_700_000_000_000;
const tokens = new JwtTokenIssuer({ jwtSecret: 'j'.repeat(40), accessTtl: 900, refreshTtlDays: 7 });

function user(over: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'u1',
    email: 'a@b.com',
    username: 'alice',
    passwordHash: 'x',
    role: 'dispatcher',
    lockedUntil: null,
    disabledAt: null,
    ...over,
  };
}

async function setup(opts: { user?: Partial<UserRecord>; accountOver?: Parameters<typeof fakeAccountState>[0] } = {}) {
  const users = fakeUsers([user(opts.user)]);
  const sessions = fakeSessions();
  const refreshTokens = fakeRefreshTokens();
  let familyRevoked = false;
  const sessionState: SessionStatePort = {
    isRevoked: async () => false,
    isUserActive: async () => true,
    revokeSession: () => {
      familyRevoked = true;
    },
  };
  const graceCache = new InMemoryGraceCache(10_000, () => T);
  const session = await sessions.create('u1');
  const opaque = 'refresh-opaque-1';
  await refreshTokens.create({
    sessionId: session.id,
    tokenHash: tokens.hashRefresh(opaque),
    expiresAt: new Date(T + 7 * 86_400_000),
  });
  const deps: RefreshDeps = {
    users,
    sessions,
    refreshTokens,
    sessionState,
    accountState: fakeAccountState(opts.accountOver),
    graceCache,
    tokens,
    clock: fixedClock(T),
    graceMs: 10_000,
  };
  return { deps, sessions, refreshTokens, session, opaque, familyRevoked: () => familyRevoked };
}

describe('refresh use case — rotación single-use + gracia + reuso (FR-004/004b/004d, D6)', () => {
  it('token válido → rota (nuevos tokens) y relee rol', async () => {
    const { deps, opaque } = await setup();
    const r = await refresh(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.accessToken).toBeTruthy();
      expect(tokens.verifyAccess(r.value.accessToken)?.role).toBe('dispatcher');
      expect(r.value.refreshToken).not.toBe(opaque);
    }
  });

  it('reintento DENTRO de gracia → mismo par (idempotente, no re-rota)', async () => {
    const { deps, opaque } = await setup();
    const first = await refresh(deps, { refreshTokenOpaque: opaque });
    const second = await refresh(deps, { refreshTokenOpaque: opaque });
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.value.accessToken).toBe(first.value.accessToken);
      expect(second.value.refreshToken).toBe(first.value.refreshToken);
    }
  });

  it('token caducado → UNAUTHENTICATED (401)', async () => {
    const { deps, refreshTokens, opaque } = await setup();
    const [id, rt] = [...refreshTokens.store.entries()][0]!;
    refreshTokens.store.set(id, { ...rt, expiresAt: new Date(T - 1000) });
    const r = await refresh(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNAUTHENTICATED');
  });

  it('sesión revocada → 401', async () => {
    const { deps, sessions, session, opaque } = await setup();
    await sessions.revoke(session.id);
    const r = await refresh(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(false);
  });

  it('usuario disabled → 401 (FR-004c)', async () => {
    const { deps, opaque } = await setup({ user: { disabledAt: new Date(T) } });
    const r = await refresh(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(false);
  });

  it('reuso FUERA de gracia → revoca familia + 401 (FR-004b)', async () => {
    const { deps, refreshTokens, opaque, familyRevoked } = await setup();
    const [id, rt] = [...refreshTokens.store.entries()][0]!;
    refreshTokens.store.set(id, { ...rt, rotatedAt: new Date(T - 20_000) }); // rotado, fuera de gracia
    const r = await refresh(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(false);
    expect(familyRevoked()).toBe(true);
  });

  it('401 uniforme entre las 4 causas (FR-005, B4): mismo code y message', async () => {
    const caducado = await setup();
    const [id1, rt1] = [...caducado.refreshTokens.store.entries()][0]!;
    caducado.refreshTokens.store.set(id1, { ...rt1, expiresAt: new Date(T - 1000) });
    const rCaducado = await refresh(caducado.deps, { refreshTokenOpaque: caducado.opaque });

    const revocado = await setup();
    await revocado.sessions.revoke(revocado.session.id);
    const rRevocado = await refresh(revocado.deps, { refreshTokenOpaque: revocado.opaque });

    const disabled = await setup({ user: { disabledAt: new Date(T) } });
    const rDisabled = await refresh(disabled.deps, { refreshTokenOpaque: disabled.opaque });

    const reuso = await setup();
    const [id4, rt4] = [...reuso.refreshTokens.store.entries()][0]!;
    reuso.refreshTokens.store.set(id4, { ...rt4, rotatedAt: new Date(T - 20_000) });
    const rReuso = await refresh(reuso.deps, { refreshTokenOpaque: reuso.opaque });

    const bodies = [rCaducado, rRevocado, rDisabled, rReuso].map((r) =>
      r.ok ? 'OK' : JSON.stringify({ code: r.error.code, message: r.error.message }),
    );
    expect(bodies.every((b) => b === bodies[0])).toBe(true);
    expect(bodies[0]).toContain('UNAUTHENTICATED');
  });

  it('fail-closed: si la BD lanza → SERVICE_UNAVAILABLE (503)', async () => {
    const { deps, opaque } = await setup();
    const brokenDeps: RefreshDeps = {
      ...deps,
      refreshTokens: {
        ...deps.refreshTokens,
        findByHash: async () => {
          throw new Error('db down');
        },
      },
    };
    const r = await refresh(brokenDeps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
