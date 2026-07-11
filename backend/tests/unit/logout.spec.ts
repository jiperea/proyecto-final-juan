import { describe, it, expect } from 'vitest';
import { logout, type LogoutDeps } from '../../src/domain/auth/logout';
import type { SessionStatePort } from '../../src/domain/ports/services';
import { JwtTokenIssuer } from '../../src/infra/crypto/token-issuer';
import { fakeRefreshTokens, fakeSessions, fixedClock } from '../helpers/fakes';

const T = 1_000_000_000;
const tokens = new JwtTokenIssuer({ jwtSecret: 'j'.repeat(40), accessTtl: 900, refreshTtlDays: 7 });

async function setup() {
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
  const session = await sessions.create('u1');
  const opaque = 'opaque-refresh-token';
  await refreshTokens.create({
    sessionId: session.id,
    tokenHash: tokens.hashRefresh(opaque),
    expiresAt: new Date(T + 7 * 86_400_000),
  });
  const deps: LogoutDeps = {
    sessions,
    refreshTokens,
    sessionState,
    tokens,
    clock: fixedClock(T),
    graceMs: 10_000,
  };
  return { deps, sessions, refreshTokens, session, opaque, familyRevoked: () => familyRevoked };
}

function markRotated(store: Map<string, { rotatedAt: Date | null }>, ago: number): void {
  const [id, rt] = [...store.entries()][0]!;
  store.set(id, { ...rt, rotatedAt: new Date(T - ago) });
}

describe('logout use case (FR-003/004b/018, D12)', () => {
  it('logout válido → ok (204) y revoca la sesión', async () => {
    const { deps, sessions, session, opaque } = await setup();
    const r = await logout(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(true);
    expect((await sessions.findById(session.id))?.revokedAt).not.toBeNull();
  });

  it('2º logout con la sesión ya revocada → UNAUTHENTICATED (401)', async () => {
    const { deps, opaque } = await setup();
    await logout(deps, { refreshTokenOpaque: opaque });
    const r = await logout(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNAUTHENTICATED');
  });

  it('token inexistente → UNAUTHENTICATED (401)', async () => {
    const { deps } = await setup();
    const r = await logout(deps, { refreshTokenOpaque: 'no-existe' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('UNAUTHENTICATED');
  });

  it('token rotado DENTRO de gracia → 204 SIN FR-004b', async () => {
    const { deps, refreshTokens, opaque, familyRevoked } = await setup();
    markRotated(refreshTokens.store, 5_000); // dentro de 10s
    const r = await logout(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(true);
    expect(familyRevoked()).toBe(false);
  });

  it('token rotado FUERA de gracia → 204 + FR-004b (revoca familia)', async () => {
    const { deps, refreshTokens, opaque, familyRevoked } = await setup();
    markRotated(refreshTokens.store, 20_000); // fuera de 10s
    const r = await logout(deps, { refreshTokenOpaque: opaque });
    expect(r.ok).toBe(true);
    expect(familyRevoked()).toBe(true);
  });
});
