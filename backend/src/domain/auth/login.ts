import { normalizeIdentifier, toIdentity, type UserIdentity } from '../model';
import type {
  RefreshTokenRepositoryPort,
  SessionRepositoryPort,
  UserRepositoryPort,
} from '../ports/repositories';
import type {
  ClockPort,
  IssuedTokens,
  PasswordHasherPort,
  RateLimitPort,
  TokenIssuerPort,
} from '../ports/services';
import { domainError, err, ok, type Result } from '../result';

export interface LoginDeps {
  readonly users: UserRepositoryPort;
  readonly sessions: SessionRepositoryPort;
  readonly refreshTokens: RefreshTokenRepositoryPort;
  readonly hasher: PasswordHasherPort;
  readonly tokens: TokenIssuerPort;
  readonly rateLimit: RateLimitPort;
  readonly clock: ClockPort;
}

export interface LoginInput {
  readonly identifier: string;
  readonly password: string;
}

export interface LoginOk {
  readonly identity: UserIdentity;
  readonly tokens: IssuedTokens;
}

const invalid = (): ReturnType<typeof domainError> =>
  domainError('INVALID_CREDENTIALS', 'Credenciales inválidas.');

const rateLimited = (retryAfterSeconds: number): ReturnType<typeof domainError> =>
  domainError('RATE_LIMITED', 'Demasiados intentos. Inténtalo más tarde.', { retryAfterSeconds });

// login (FR-001/002/002b/011): resuelve identifier, lockout (429 antes del hash, D7),
// verifica contraseña (real o dummy anti-timing, D4), disabled DESPUÉS del hash (FR-002b, 401 uniforme).
export async function login(deps: LoginDeps, input: LoginInput): Promise<Result<LoginOk>> {
  const norm = normalizeIdentifier(input.identifier);
  const user = await deps.users.findByIdentifierNorm(norm);
  const key = user ? user.id : deps.rateLimit.keyForIdentifier(norm);
  const now = deps.clock.now();

  if (deps.rateLimit.check(key).locked) {
    return err(rateLimited(deps.rateLimit.check(key).retryAfterSeconds));
  }
  if (user?.lockedUntil && user.lockedUntil > now) {
    return err(rateLimited(Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000)));
  }

  let valid = false;
  if (user) {
    valid = await deps.hasher.verify(user.passwordHash, input.password);
  } else {
    await deps.hasher.dummyVerify(input.password);
  }
  const disabled = user?.disabledAt != null;

  if (!valid || disabled) {
    const dec = deps.rateLimit.registerFailure(key);
    return err(dec.locked ? rateLimited(dec.retryAfterSeconds) : invalid());
  }
  if (!user) {
    return err(invalid());
  }

  deps.rateLimit.reset(key);
  const session = await deps.sessions.create(user.id);
  const issued = deps.tokens.issue({ sub: user.id, sid: session.id, role: user.role });
  await deps.refreshTokens.create({
    sessionId: session.id,
    tokenHash: issued.refreshTokenHash,
    expiresAt: issued.refreshExpiresAt,
  });
  return ok({ identity: toIdentity(user), tokens: issued });
}
