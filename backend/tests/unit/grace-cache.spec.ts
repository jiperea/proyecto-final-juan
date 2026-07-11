import { describe, it, expect } from 'vitest';
import { InMemoryGraceCache } from '../../src/infra/grace-cache/in-memory';
import type { GracePair } from '../../src/domain/ports/services';

const pair: GracePair = {
  accessToken: 'a',
  expiresIn: 900,
  refreshToken: 'r',
  csrfToken: 'c',
};

describe('InMemoryGraceCache (FR-004d)', () => {
  it('devuelve el par dentro del TTL', () => {
    const ref = { t: 1000 };
    const cache = new InMemoryGraceCache(10_000, () => ref.t);
    cache.set('h', pair);
    expect(cache.get('h')).toEqual(pair);
  });

  it('expira y devuelve null pasado el TTL', () => {
    const ref = { t: 1000 };
    const cache = new InMemoryGraceCache(10_000, () => ref.t);
    cache.set('h', pair);
    ref.t += 10_001;
    expect(cache.get('h')).toBeNull();
  });

  it('hash inexistente → null', () => {
    const cache = new InMemoryGraceCache(10_000, () => 0);
    expect(cache.get('nope')).toBeNull();
  });
});
