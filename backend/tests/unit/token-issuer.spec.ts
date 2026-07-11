import { describe, it, expect } from 'vitest';
import { JwtTokenIssuer } from '../../src/infra/crypto/token-issuer';

const issuer = new JwtTokenIssuer({
  jwtSecret: 'j'.repeat(40),
  accessTtl: 900,
  refreshTtlDays: 7,
});

const claims = { sub: 'user-1', sid: 'session-1', role: 'dispatcher' as const };

describe('JwtTokenIssuer (D5)', () => {
  it('issue emite access verificable + refresh opaco con su hash + csrf', () => {
    const t = issuer.issue(claims);
    expect(t.expiresIn).toBe(900);
    expect(t.refreshToken).toHaveLength(64); // 32 bytes hex
    expect(t.refreshTokenHash).toHaveLength(64); // sha-256 hex
    expect(t.refreshTokenHash).not.toBe(t.refreshToken);
    expect(t.csrfToken.length).toBeGreaterThanOrEqual(32);
    expect(t.refreshExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('verifyAccess devuelve los claims de un token válido', () => {
    const t = issuer.issue(claims);
    const decoded = issuer.verifyAccess(t.accessToken);
    expect(decoded).toEqual({ sub: 'user-1', sid: 'session-1', role: 'dispatcher' });
  });

  it('verifyAccess devuelve null ante token manipulado/ inválido', () => {
    expect(issuer.verifyAccess('no-es-un-jwt')).toBeNull();
    const t = issuer.issue(claims);
    expect(issuer.verifyAccess(t.accessToken + 'x')).toBeNull();
  });

  it('hashRefresh es SHA-256 hex determinista', () => {
    const a = issuer.hashRefresh('token-opaco');
    const b = issuer.hashRefresh('token-opaco');
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});
