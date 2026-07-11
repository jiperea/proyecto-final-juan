import { toIdentity, type UserIdentity } from '../model';
import type {
  AccountStatePort,
  RefreshTokenRepositoryPort,
  SessionRepositoryPort,
  UserRepositoryPort,
} from '../ports/repositories';
import type {
  ClockPort,
  GraceCachePort,
  GracePair,
  SessionStatePort,
  TokenIssuerPort,
} from '../ports/services';
import { domainError, err, ok, type Result } from '../result';

export interface RefreshDeps {
  readonly users: UserRepositoryPort;
  readonly sessions: SessionRepositoryPort;
  readonly refreshTokens: RefreshTokenRepositoryPort;
  readonly sessionState: SessionStatePort;
  readonly accountState: AccountStatePort;
  readonly graceCache: GraceCachePort;
  readonly tokens: TokenIssuerPort;
  readonly clock: ClockPort;
  readonly graceMs: number;
}

export interface RefreshInput {
  readonly refreshTokenOpaque: string;
}

export interface RefreshOk {
  readonly identity: UserIdentity;
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly csrfToken: string;
}

const unauth = (): ReturnType<typeof domainError> =>
  domainError('UNAUTHENTICATED', 'No autenticado.');

async function okFrom(
  users: UserRepositoryPort,
  userId: string,
  pair: GracePair,
): Promise<Result<RefreshOk>> {
  const user = await users.findById(userId);
  if (!user) {
    return err(unauth());
  }
  return ok({ identity: toIdentity(user), ...pair });
}

// Reintento del mismo token ya rotado: gracia (mismo par, re-check BD) o reuso (revoca familia).
async function handleRotated(deps: RefreshDeps, sessionId: string, hash: string, ageMs: number): Promise<Result<RefreshOk>> {
  if (ageMs <= deps.graceMs) {
    const cached = deps.graceCache.get(hash);
    if (!cached) {
      return err(unauth()); // gracia perdida → re-login, sin revocar (evita falso positivo)
    }
    const session = await deps.sessions.findById(sessionId);
    if (!session || session.revokedAt) {
      return err(unauth());
    }
    if (await deps.accountState.isUserDisabled(session.userId)) {
      return err(unauth());
    }
    return okFrom(deps.users, session.userId, cached);
  }
  await deps.sessions.revoke(sessionId); // reuso fuera de gracia → revoca familia (FR-004b)
  deps.sessionState.revokeSession(sessionId);
  return err(unauth());
}

// refresh (FR-004/004b/004c/004d/005, D6): rotación single-use atómica, gracia y detección de reuso.
export async function refresh(deps: RefreshDeps, input: RefreshInput): Promise<Result<RefreshOk>> {
  try {
    const hash = deps.tokens.hashRefresh(input.refreshTokenOpaque);
    const rt = await deps.refreshTokens.findByHash(hash);
    if (!rt) {
      return err(unauth());
    }
    const now = deps.clock.now();
    if (rt.rotatedAt) {
      return handleRotated(deps, rt.sessionId, hash, now.getTime() - rt.rotatedAt.getTime());
    }
    if (rt.expiresAt <= now) {
      return err(unauth());
    }
    const session = await deps.sessions.findById(rt.sessionId);
    if (!session || session.revokedAt) {
      return err(unauth());
    }
    const user = await deps.users.findById(session.userId);
    if (!user || user.disabledAt) {
      return err(unauth()); // FR-004c
    }
    const issued = deps.tokens.issue({ sub: user.id, sid: session.id, role: user.role }); // relee rol
    const newRt = await deps.refreshTokens.create({
      sessionId: session.id,
      tokenHash: issued.refreshTokenHash,
      expiresAt: issued.refreshExpiresAt,
    });
    const won = await deps.refreshTokens.rotateAtomic(rt.id, newRt.id);
    const pair: GracePair = {
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
      refreshToken: issued.refreshToken,
      csrfToken: issued.csrfToken,
    };
    if (!won) {
      const cached = deps.graceCache.get(hash);
      return cached ? okFrom(deps.users, session.userId, cached) : err(unauth());
    }
    deps.graceCache.set(hash, pair);
    return ok({ identity: toIdentity(user), ...pair });
  } catch {
    return err(domainError('SERVICE_UNAVAILABLE', 'Servicio no disponible.'));
  }
}
