// Modelo de dominio (puro, sin dependencias de infraestructura).

export type Role = 'dispatcher' | 'technician' | 'supervisor';

export const ROLES: readonly Role[] = ['dispatcher', 'technician', 'supervisor'];

/** Identidad pública (lo que exponen `login`/`me`). Nunca incluye hash ni tokens. */
export interface UserIdentity {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly role: Role;
}

/** Usuario completo tal como vive en persistencia (incluye el hash; no sale del dominio). */
export interface UserRecord {
  readonly id: string;
  readonly email: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly role: Role;
  readonly lockedUntil: Date | null;
  readonly disabledAt: Date | null;
}

/** Familia de refresh (sesión). */
export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly revokedAt: Date | null;
}

/** Token de refresh (single-use con rotación). En BD solo su hash SHA-256. */
export interface RefreshTokenRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly rotatedAt: Date | null;
  readonly replacedBy: string | null;
}

export function toIdentity(user: UserRecord): UserIdentity {
  return { id: user.id, email: user.email, username: user.username, role: user.role };
}

/** Normaliza un identifier (email o username) al espacio de unicidad global (D11): minúsculas + trim. */
export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}
