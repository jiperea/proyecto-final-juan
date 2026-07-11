import { describe, it, expect } from 'vitest';
import { InMemoryRateLimit } from '../../src/infra/ratelimit/in-memory';

const secret = 'l'.repeat(40);
function make(nowRef: { t: number }): InMemoryRateLimit {
  return new InMemoryRateLimit({
    max: 5,
    windowMs: 15 * 60_000,
    lockoutMs: 15 * 60_000,
    lockoutSecret: secret,
    now: () => nowRef.t,
  });
}

describe('lockout / anti-enumeración (FR-011, D7)', () => {
  it('bloquea tras 5 fallos en la ventana y check() lo refleja (429)', () => {
    const ref = { t: 1000 };
    const rl = make(ref);
    for (let i = 0; i < 4; i++) {
      expect(rl.registerFailure('k').locked).toBe(false);
    }
    const fifth = rl.registerFailure('k');
    expect(fifth.locked).toBe(true);
    expect(fifth.retryAfterSeconds).toBeGreaterThan(0);
    expect(rl.check('k').locked).toBe(true);
  });

  it('reset al caducar la ventana: 4 fallos + ventana expirada → no bloquea', () => {
    const ref = { t: 1000 };
    const rl = make(ref);
    for (let i = 0; i < 4; i++) {
      rl.registerFailure('k');
    }
    ref.t += 15 * 60_000 + 1; // la ventana caduca
    expect(rl.registerFailure('k').locked).toBe(false);
  });

  it('reset() limpia el contador tras login correcto', () => {
    const ref = { t: 1000 };
    const rl = make(ref);
    for (let i = 0; i < 3; i++) {
      rl.registerFailure('k');
    }
    rl.reset('k');
    for (let i = 0; i < 4; i++) {
      expect(rl.registerFailure('k').locked).toBe(false);
    }
  });

  it('keyForIdentifier es HMAC-SHA256 estable y no reversible (64 hex)', () => {
    const rl = make({ t: 1 });
    expect(rl.keyForIdentifier('a@b.com')).toBe(rl.keyForIdentifier('a@b.com'));
    expect(rl.keyForIdentifier('a@b.com')).toHaveLength(64);
    expect(rl.keyForIdentifier('a@b.com')).not.toBe('a@b.com');
  });
});
