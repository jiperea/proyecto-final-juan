import type { RefreshTokenRepositoryPort, SessionRepositoryPort } from '../ports/repositories';
import type { ClockPort, SessionStatePort, TokenIssuerPort } from '../ports/services';
import { domainError, err, ok, type Result } from '../result';

export interface LogoutDeps {
  readonly sessions: SessionRepositoryPort;
  readonly refreshTokens: RefreshTokenRepositoryPort;
  readonly sessionState: SessionStatePort;
  readonly tokens: TokenIssuerPort;
  readonly clock: ClockPort;
  readonly graceMs: number;
}

export interface LogoutInput {
  readonly refreshTokenOpaque: string;
}

const unauth = (): ReturnType<typeof domainError> =>
  domainError('UNAUTHENTICATED', 'No autenticado.');

// logout (FR-003/004b/018, D12): revoca la sesión (sid) si no lo estaba —aunque el token esté rotado
// o la cuenta disabled— → 204; token rotado FUERA de gracia → además FR-004b (revoca familia).
// Lectura de estado contra BD; fail-closed 503 si la BD no responde.
export async function logout(deps: LogoutDeps, input: LogoutInput): Promise<Result<void>> {
  try {
    const hash = deps.tokens.hashRefresh(input.refreshTokenOpaque);
    const rt = await deps.refreshTokens.findByHash(hash);
    if (!rt) {
      return err(unauth());
    }
    const session = await deps.sessions.findById(rt.sessionId);
    if (!session || session.revokedAt) {
      return err(unauth());
    }
    const didRevoke = await deps.sessions.revoke(session.id);
    if (!didRevoke) {
      return err(unauth()); // carrera: revocada concurrentemente
    }
    if (rt.rotatedAt) {
      const ageMs = deps.clock.now().getTime() - rt.rotatedAt.getTime();
      if (ageMs > deps.graceMs) {
        deps.sessionState.revokeSession(session.id); // reuso fuera de gracia → contención (FR-004b)
      }
    }
    return ok(undefined);
  } catch {
    return err(domainError('SERVICE_UNAVAILABLE', 'Servicio no disponible.')); // fail-closed
  }
}
