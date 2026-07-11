import type { RequestHandler } from 'express';
import { evaluateProbeAccess } from '../../domain/rbac/policy';
import type { ProbeResourceRepositoryPort } from '../../domain/ports/repositories';
import { domainError } from '../../domain/result';
import { sendError } from '../error-mapper';
import '../http-types';

// Aplica la política RBAC al recurso de prueba (FR-008/009/017/018). Debe ir DESPUÉS de authenticate.
// Para technician resuelve 403 sin consultar la instancia (orden rol→pertenencia).
export function authorizeProbe(probes: ProbeResourceRepositoryPort): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const id = req.params.id ?? '';
    const scopes = auth.role === 'technician' ? null : await probes.findInScopeRoles(id);
    const decision = evaluateProbeAccess(auth.role, scopes);
    if (decision === 'forbidden') {
      sendError(res, domainError('FORBIDDEN', 'No autorizado para esta acción.'));
      return;
    }
    if (decision === 'not_found') {
      sendError(res, domainError('NOT_FOUND', 'Recurso no encontrado.'));
      return;
    }
    next();
  };
}
