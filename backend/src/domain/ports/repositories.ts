import type { RefreshTokenRecord, Role, SessionRecord, UserRecord } from '../model';

// Puertos de repositorio (Constitution III). El dominio depende de estas interfaces, no de Prisma.

export interface UserRepositoryPort {
  /** Resuelve un identifier normalizado (email o username) a un único usuario o null (D11). */
  findByIdentifierNorm(identifierNorm: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
}

export interface SessionRepositoryPort {
  create(userId: string): Promise<SessionRecord>;
  findById(id: string): Promise<SessionRecord | null>;
  /**
   * Marca `revoked_at` si la sesión existe y NO estaba ya revocada.
   * Devuelve true si esta llamada la revocó; false si no existía o ya estaba revocada (logout no idempotente).
   */
  revoke(id: string): Promise<boolean>;
}

export interface CreateRefreshTokenInput {
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface RefreshTokenRepositoryPort {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /**
   * Rotación single-use ATÓMICA que exige sesión no revocada (D6/H-001):
   * marca `rotated_at`+`replaced_by` sólo si `rotated_at IS NULL` Y la sesión sigue vigente.
   * Devuelve true si esta petición ganó la carrera (cierra TOCTOU logout↔refresh).
   */
  rotateAtomic(tokenId: string, replacedById: string): Promise<boolean>;
}

/** Consulta autoritativa de estado de familia/cuenta (fallback de la caché; refresh). */
export interface AccountStatePort {
  /** true si la sesión (familia) está revocada. */
  isSessionRevoked(sessionId: string): Promise<boolean>;
  /** true si el usuario está `disabled`. */
  isUserDisabled(userId: string): Promise<boolean>;
}

export interface ProbeResourceRepositoryPort {
  /** Roles en cuyo alcance está el recurso; null si no existe (404-por-inexistencia). */
  findInScopeRoles(id: string): Promise<readonly Role[] | null>;
}
