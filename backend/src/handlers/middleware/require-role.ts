import type { RequestHandler } from 'express';
import type { Role } from '../../domain/model';
import { domainError } from '../../domain/result';
import { sendError } from '../error-mapper';
import '../http-types';

// Allowlist default-deny (FR-006). Debe ir DESPUÉS de authenticate (que ya garantizó 401).
// Mensaje genérico: no enumera roles permitidos ni revela el rol del principal (S-004).
export function requireRole(...allowed: Role[]): RequestHandler {
  const allow = new Set<string>(allowed);
  return (req, res, next): void => {
    const role = req.auth?.role;
    if (role === undefined || !allow.has(role)) {
      sendError(res, domainError('FORBIDDEN', 'No autorizado para esta acción.'));
      return;
    }
    next();
  };
}
