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
  | 'SERVICE_UNAVAILABLE' // 503 fail-closed (BD caída en régimen autoritativo)
  // --- 002b: transición de estado de Order (D7) ---
  | 'ORDER_NOT_FOUND' // 404 orden inexistente
  | 'VERSION_CONFLICT' // 409 expectedVersion obsoleta (concurrencia optimista)
  | 'INVALID_TRANSITION' // 422 par origen→destino no legal (FSM)
  | 'GUARD_UNMET' // guarda de pertenencia no satisfecha; HTTP gobernado por el llamador (FR-009)
  | 'ACTOR_INVALID' // FK de actor_id inválida; error interno, sin filtrar detalle de BD
  // --- 004: reasignación de orden ---
  | 'FORBIDDEN_ROLE' // 403 rol autenticado ≠ dispatcher (FR-003)
  | 'INVALID_ASSIGNEE' // 422 técnico destino inválido (4 causas, cuerpo genérico idéntico, FR-005)
  // --- 005: registro de ejecución (validación de evidencia, payload primero) ---
  | 'EVIDENCE_REQUIRED' // 422 ejecución sin ≥1 evidencia (bloqueante, Brief "al menos una foto")
  | 'INVALID_EVIDENCE' // 422 evidencia inválida (tipo/tamaño/object_ref/duplicado/>máximo)
  // --- 006: revisión del supervisor ---
  | 'INVALID_REASON' // 422 motivo inválido tras saneo (rechazo obligatorio; approve si se aporta) — 1..1000
  | 'EVIDENCE_MISSING' // 409 aprobar una orden visible en pending_review pero SIN ≥1 evidencia (invariante 005 rota)
  | 'INTERNAL'; // 500 genérico (error de BD/inesperado); nunca filtra detalle de Postgres (FR-009)

export interface DomainError {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: { readonly fields?: readonly string[] };
  /** Segundos hasta reintentar (429). */
  readonly retryAfterSeconds?: number;
  /** Acción sugerida para el agente/cliente (Constitution X). Opcional, retrocompatible (004). */
  readonly agentAction?: string;
}

export function domainError(
  code: ErrorCode,
  message: string,
  extra?: Pick<DomainError, 'details' | 'retryAfterSeconds' | 'agentAction'>,
): DomainError {
  return { code, message, ...extra };
}
