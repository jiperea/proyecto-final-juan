import argon2 from 'argon2';
import type { PasswordHasherPort } from '../../domain/ports/services';

// argon2id con parámetros OWASP (memoria ≥19 MiB). Anti-timing: dummyVerify de coste equivalente (D4).
export class Argon2PasswordHasher implements PasswordHasherPort {
  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // KiB ≈ 19 MiB
    timeCost: 2,
    parallelism: 1,
  } as const;

  private dummyHashPromise?: Promise<string>;

  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  private dummy(): Promise<string> {
    this.dummyHashPromise ??= argon2.hash('dummy-anti-timing-value', this.options);
    return this.dummyHashPromise;
  }

  async dummyVerify(plain: string): Promise<void> {
    try {
      await argon2.verify(await this.dummy(), plain);
    } catch {
      /* coste equivalente a un verify real; el resultado se descarta */
    }
  }
}
