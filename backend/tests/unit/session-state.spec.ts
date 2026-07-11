import { describe, it, expect } from 'vitest';
import { InMemorySessionState } from '../../src/infra/session-state/in-memory';
import type { AccountStatePort } from '../../src/domain/ports/repositories';

function fakeAccount(over: Partial<AccountStatePort> = {}): AccountStatePort {
  return {
    isSessionRevoked: async () => false,
    isUserDisabled: async () => false,
    ...over,
  };
}

describe('InMemorySessionState (D3)', () => {
  it('revokeSession → isRevoked true de inmediato (write-through)', async () => {
    const s = new InMemorySessionState(fakeAccount(), 30_000);
    s.revokeSession('sid-1');
    expect(await s.isRevoked('sid-1')).toBe(true);
  });

  it('cache-miss → fallback a BD (consulta familia y disabled)', async () => {
    let sessionCalls = 0;
    const s = new InMemorySessionState(
      fakeAccount({
        isSessionRevoked: async () => {
          sessionCalls++;
          return true;
        },
      }),
      30_000,
    );
    expect(await s.isRevoked('sid-x')).toBe(true);
    expect(sessionCalls).toBe(1);
  });

  it('fail-closed: si la BD lanza en cache-miss, propaga el error (el caller decide 401/503)', async () => {
    const s = new InMemorySessionState(
      fakeAccount({
        isSessionRevoked: async () => {
          throw new Error('db down');
        },
      }),
      30_000,
    );
    await expect(s.isRevoked('sid-y')).rejects.toThrow();
  });

  it('re-habilitar cuenta se propaga al expirar el TTL (H-006, no add-only)', async () => {
    const ref = { t: 1000 };
    let disabled = true;
    const s = new InMemorySessionState(
      fakeAccount({ isUserDisabled: async () => disabled }),
      30_000,
      () => ref.t,
    );
    expect(await s.isUserActive('u1')).toBe(false);
    disabled = false; // admin re-habilita
    ref.t += 30_001; // TTL expira → re-evalúa
    expect(await s.isUserActive('u1')).toBe(true);
  });
});
