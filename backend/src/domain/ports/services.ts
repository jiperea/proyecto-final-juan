import type { Role } from '../model';

// Puertos de servicio (Constitution III). Adaptadores en infra (argon2, jwt, in-memory).

export interface PasswordHasherPort {
  hash(plain: string): Promise<string>;
  verify(hash: string, plain: string): Promise<boolean>;
  /** Hash dummy de coste equivalente para el camino "usuario inexistente" (anti-timing, D4/FR-011). */
  dummyVerify(plain: string): Promise<void>;
}

export interface AccessClaims {
  readonly sub: string; // user id
  readonly sid: string; // session (familia)
  readonly role: Role;
}

export interface IssuedTokens {
  readonly accessToken: string;
  readonly expiresIn: number; // segundos
  /** Token de refresh opaco en claro (se entrega al cliente; en BD sólo su hash). */
  readonly refreshToken: string;
  readonly refreshTokenHash: string;
  readonly refreshExpiresAt: Date;
  readonly csrfToken: string;
}

export interface TokenIssuerPort {
  issue(claims: AccessClaims): IssuedTokens;
  /** Verifica firma+exp del access y devuelve los claims, o null si inválido. */
  verifyAccess(token: string): AccessClaims | null;
  /** SHA-256 del token opaco de refresh (para buscar/almacenar). */
  hashRefresh(opaqueToken: string): string;
}

/** Caché de revocación por-request (D3): revocación de familia + usuarios disabled, con fallback a BD. */
export interface SessionStatePort {
  /** true si la sesión (sid) está revocada. Fail-closed ante fallo de BD en cache-miss. */
  isRevoked(sessionId: string): Promise<boolean>;
  /** true si el usuario sigue activo (no disabled). Fail-closed. */
  isUserActive(userId: string): Promise<boolean>;
  /** Write-through síncrono: marca la familia como revocada (FR-004b). */
  revokeSession(sessionId: string): void;
}

export interface GracePair {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly refreshToken: string;
  readonly csrfToken: string;
}

/** Caché efímera de gracia de refresh (FR-004d): re-sirve el mismo trío durante ≤10s. */
export interface GraceCachePort {
  get(tokenHash: string): GracePair | null;
  set(tokenHash: string, pair: GracePair): void;
}

export interface RateLimitDecision {
  readonly locked: boolean;
  readonly retryAfterSeconds: number;
}

/** Lockout / anti-enumeración (FR-011). Clave = user_id resuelto o HMAC del identifier. */
export interface RateLimitPort {
  /** ¿Está bloqueada la clave ahora mismo? (se comprueba antes del hash). */
  check(key: string): RateLimitDecision;
  /** Registra un intento fallido; devuelve la decisión resultante. */
  registerFailure(key: string): RateLimitDecision;
  /** Limpia el contador tras un login correcto. */
  reset(key: string): void;
  /** Clave HMAC-SHA256(identifier_norm, LOCKOUT_HMAC_SECRET) para identifier no resuelto (D7). */
  keyForIdentifier(identifierNorm: string): string;
}

export interface ClockPort {
  now(): Date;
}
