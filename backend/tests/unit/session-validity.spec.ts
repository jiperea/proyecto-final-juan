import { describe, it, expect } from 'vitest';
import { RefreshSessionValidity } from '../../src/infra/session-validity';
import { JwtTokenIssuer } from '../../src/infra/crypto/token-issuer';
import { fakeAccountState, fakeRefreshTokens, fakeSessions, fixedClock } from '../helpers/fakes';

const T = 1_700_000_000_000;
const tokens = new JwtTokenIssuer({ jwtSecret: 'j'.repeat(40), accessTtl: 900, refreshTtlDays: 7 });

async function make(opts: { revoked?: boolean; expired?: boolean; disabled?: boolean } = {}) {
  const sessions = fakeSessions();
  const refreshTokens = fakeRefreshTokens();
  const session = await sessions.create('u1');
  if (opts.revoked) {
    await sessions.revoke(session.id);
  }
  const opaque = 'op';
  await refreshTokens.create({
    sessionId: session.id,
    tokenHash: tokens.hashRefresh(opaque),
    expiresAt: new Date(opts.expired ? T - 1000 : T + 1_000_000_000),
  });
  const accountState = fakeAccountState({ isUserDisabled: async () => opts.disabled ?? false });
  const validity = new RefreshSessionValidity(tokens, refreshTokens, sessions, accountState, fixedClock(T));
  return { validity, opaque };
}

describe('RefreshSessionValidity — orden CSRF FR-018 (B1 + S-001)', () => {
  it('sesión activa → válida (CSRF fallido daría 403)', async () => {
    const { validity, opaque } = await make();
    expect(await validity.isSessionValid(opaque)).toBe(true);
  });

  it('token inexistente → inválida (401)', async () => {
    const { validity } = await make();
    expect(await validity.isSessionValid('no-existe')).toBe(false);
  });

  it('sesión revocada → inválida (401)', async () => {
    const { validity, opaque } = await make({ revoked: true });
    expect(await validity.isSessionValid(opaque)).toBe(false);
  });

  it('refresh caducado → inválida (401)', async () => {
    const { validity, opaque } = await make({ expired: true });
    expect(await validity.isSessionValid(opaque)).toBe(false);
  });

  it('cuenta disabled → inválida (401, S-001): la tercera causa que faltaba', async () => {
    const { validity, opaque } = await make({ disabled: true });
    expect(await validity.isSessionValid(opaque)).toBe(false);
  });
});
