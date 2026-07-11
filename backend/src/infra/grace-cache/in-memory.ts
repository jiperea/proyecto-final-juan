import type { GraceCachePort, GracePair } from '../../domain/ports/services';

// Caché efímera de gracia (FR-004d, D6): re-sirve el mismo trío durante la ventana (≤10s).
// La re-comprobación de revocación/disabled contra BD antes de servir la hace el use case (H-005/S-001).
export class InMemoryGraceCache implements GraceCachePort {
  private readonly map = new Map<string, { pair: GracePair; exp: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get(tokenHash: string): GracePair | null {
    const entry = this.map.get(tokenHash);
    if (!entry) {
      return null;
    }
    if (entry.exp <= this.now()) {
      this.map.delete(tokenHash);
      return null;
    }
    return entry.pair;
  }

  set(tokenHash: string, pair: GracePair): void {
    this.map.set(tokenHash, { pair, exp: this.now() + this.ttlMs });
  }
}
