// Result<Ok,Err> + catálogo de errores de dominio (Constitution X — errores accionables).
// El `code` es estable y machine-readable; el error-mapper (infra/handlers) lo traduce a HTTP.

export type Result<T, E = DomainError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type ErrorCode =
  | 'INVALID_CREDENTIALS' // 401 login (uniforme, no revela existencia)
  | 'UNAUTHENTICATED' // 401 me/refresh/logout sin sesión válida
  | 'CSRF_INVALID' // 403 double-submit falla/ausente
  | 'FORBIDDEN' // 403 rol no autorizado
  | 'NOT_FOUND' // 404 fuera de alcance o inexistente (no revela existencia)
  | 'VALIDATION_ERROR' // 422 cuerpo mal formado
  | 'RATE_LIMITED' // 429 lockout
  | 'SERVICE_UNAVAILABLE'; // 503 fail-closed (BD caída en régimen autoritativo)

export interface DomainError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: { readonly fields?: readonly string[] };
  /** Segundos hasta reintentar (429). */
  readonly retryAfterSeconds?: number;
}

export function domainError(
  code: ErrorCode,
  message: string,
  extra?: Pick<DomainError, 'details' | 'retryAfterSeconds'>,
): DomainError {
  return { code, message, ...extra };
}
