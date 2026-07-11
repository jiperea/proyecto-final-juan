import { describe, it, expect } from 'vitest';
import { Argon2PasswordHasher } from '../../src/infra/crypto/password-hasher';

const hasher = new Argon2PasswordHasher();

describe('Argon2PasswordHasher (D4)', () => {
  it('hash + verify hacen roundtrip', async () => {
    const hash = await hasher.hash('SuperSecret123!');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await hasher.verify(hash, 'SuperSecret123!')).toBe(true);
  });

  it('verify falla con contraseña incorrecta', async () => {
    const hash = await hasher.hash('SuperSecret123!');
    expect(await hasher.verify(hash, 'otra-cosa-123')).toBe(false);
  });

  it('dummyVerify resuelve sin lanzar (anti-timing, usuario inexistente)', async () => {
    await expect(hasher.dummyVerify('cualquier-cosa')).resolves.toBeUndefined();
  });
});
