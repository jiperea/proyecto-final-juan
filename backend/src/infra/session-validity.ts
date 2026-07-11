import type {
  RefreshTokenRepositoryPort,
  SessionRepositoryPort,
} from '../domain/ports/repositories';
import type { ClockPort, TokenIssuerPort } from '../domain/ports/services';
import type { SessionValidityPort } from '../handlers/middleware/csrf';

// Adaptador que decide si una cookie de refresh corresponde a una sesión válida (para el orden CSRF).
// "No válida" (→401) = token inexistente, sesión revocada, o refresh fresco caducado (contrato FR-018).
// Un token rotado con sesión viva se considera válido (logout D12 / gracia) → CSRF inválido daría 403.
export class RefreshSessionValidity implements SessionValidityPort {
  constructor(
    private readonly tokens: TokenIssuerPort,
    private readonly refreshTokens: RefreshTokenRepositoryPort,
    private readonly sessions: SessionRepositoryPort,
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
    return true;
  }
}
