import type {
  AccountStatePort,
  RefreshTokenRepositoryPort,
  SessionRepositoryPort,
} from '../domain/ports/repositories';
import type { ClockPort, TokenIssuerPort } from '../domain/ports/services';
import type { SessionValidityPort } from '../handlers/middleware/csrf';

// Adaptador que decide si una cookie de refresh corresponde a una sesión válida (para el orden CSRF).
// "No válida" (→401, FR-018/FR-004c) = token inexistente, refresh fresco caducado, sesión revocada, o cuenta
// `disabled`. Un token rotado con sesión viva y cuenta activa se considera válido (logout D12 / gracia) → 403.
export class RefreshSessionValidity implements SessionValidityPort {
  constructor(
    private readonly tokens: TokenIssuerPort,
    private readonly refreshTokens: RefreshTokenRepositoryPort,
    private readonly sessions: SessionRepositoryPort,
    private readonly accountState: AccountStatePort,
    private readonly clock: ClockPort,
  ) {}

  async isSessionValid(refreshOpaque: string): Promise<boolean> {
    const rt = await this.refreshTokens.findByHash(this.tokens.hashRefresh(refreshOpaque));
    if (!rt) {
      return false;
    }
    const session = await this.sessions.findById(rt.sessionId);
    if (!session || session.revokedAt) {
      return false;
    }
    if (!rt.rotatedAt && rt.expiresAt <= this.clock.now()) {
      return false;
    }
    if (await this.accountState.isUserDisabled(session.userId)) {
      return false; // cuenta disabled → 401 antes que CSRF (FR-004c/FR-018, S-001)
    }
    return true;
  }
}
