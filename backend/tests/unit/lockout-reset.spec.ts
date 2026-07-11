import { describe, it, expect } from 'vitest';
import { InMemoryRateLimit } from '../../src/infra/ratelimit/in-memory';

function make(nowRef: { t: number }): InMemoryRateLimit {
  return new InMemoryRateLimit({
    max: 5,
    windowMs: 15 * 60_000,
    lockoutMs: 15 * 60_000,
    lockoutSecret: 'l'.repeat(40),
    now: () => nowRef.t,
  });
}

describe('reset de ventana tras desbloqueo (FR-011)', () => {
  it('tras expirar el bloqueo, hacen falta 5 fallos frescos para re-bloquear', () => {
    const ref = { t: 1000 };
    const rl = make(ref);
    for (let i = 0; i < 5; i++) {
      rl.registerFailure('k');
    }
    expect(rl.check('k').locked).toBe(true);

    ref.t += 15 * 60_000 + 1; // expira el bloqueo
    expect(rl.check('k').locked).toBe(false);

    // ventana nueva: 4 fallos no bloquean; el 5º sí
    for (let i = 0; i < 4; i++) {
      expect(rl.registerFailure('k').locked).toBe(false);
    }
    expect(rl.registerFailure('k').locked).toBe(true);
  });
});
