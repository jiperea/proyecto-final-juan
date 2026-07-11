import type { AccountStatePort } from '../../domain/ports/repositories';
import type { SessionStatePort } from '../../domain/ports/services';

interface CacheEntry {
  value: boolean;
  exp: number;
}

// Caché de revocación por-request (D3): revocación de familia (monotónica, write-through) + estado
// disabled (TTL re-evaluado para propagar re-habilitación, H-006). Cache-miss → fallback a BD;
// si la BD lanza, PROPAGA (fail-closed: el caller decide 401 per-request / 503 en refresh).
export class InMemorySessionState implements SessionStatePort {
  private readonly revokedSids = new Set<string>();
  private readonly sessionCache = new Map<string, CacheEntry>();
  private readonly userActiveCache = new Map<string, CacheEntry>();

  constructor(
    private readonly account: AccountStatePort,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  async isRevoked(sessionId: string): Promise<boolean> {
    if (this.revokedSids.has(sessionId)) {
      return true;
    }
    const cached = this.sessionCache.get(sessionId);
    if (cached && cached.exp > this.now()) {
      return cached.value;
    }
    const revoked = await this.account.isSessionRevoked(sessionId); // puede lanzar → fail-closed
    this.sessionCache.set(sessionId, { value: revoked, exp: this.now() + this.ttlMs });
    if (revoked) {
      this.revokedSids.add(sessionId);
    }
    return revoked;
  }

  async isUserActive(userId: string): Promise<boolean> {
    const cached = this.userActiveCache.get(userId);
    if (cached && cached.exp > this.now()) {
      return cached.value;
    }
    const disabled = await this.account.isUserDisabled(userId); // puede lanzar → fail-closed
    const active = !disabled;
    // TTL re-evaluado (no add-only): re-habilitar una cuenta se propaga al expirar el TTL (H-006).
    this.userActiveCache.set(userId, { value: active, exp: this.now() + this.ttlMs });
    return active;
  }

  revokeSession(sessionId: string): void {
    this.revokedSids.add(sessionId);
    this.sessionCache.set(sessionId, { value: true, exp: Number.POSITIVE_INFINITY });
  }
}
