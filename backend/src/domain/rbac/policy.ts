import type { Role } from '../model';

export type ProbeDecision = 'allow' | 'forbidden' | 'not_found';

// Regla determinista del recurso de prueba RBAC (FR-017/017b, D10). Orden rol→pertenencia:
// - technician nunca puede esta acción → forbidden (403), sin mirar la instancia.
// - dispatcher/supervisor: 200 si el id está en su alcance; 404 si no existe o está fuera de alcance.
// `inScopeRoles === null` significa recurso inexistente. Base-ready para la matriz real de 002.
export function evaluateProbeAccess(
  role: Role,
  inScopeRoles: readonly Role[] | null,
): ProbeDecision {
  if (role === 'technician') {
    return 'forbidden';
  }
  if (inScopeRoles === null) {
    return 'not_found';
  }
  return inScopeRoles.includes(role) ? 'allow' : 'not_found';
}
