import type { RequestHandler } from 'express';
import { domainError } from '../../domain/result';
import type { SessionStatePort, TokenIssuerPort } from '../../domain/ports/services';
import { sendError } from '../error-mapper';
import '../http-types';

function unauthenticated(): ReturnType<typeof domainError> {
  return domainError('UNAUTHENTICATED', 'No autenticado.');
}

// Valida el access (JWT local) + estado por-request vía SessionStatePort (caché+fallback BD).
// Fail-closed: ante fallo de BD en cache-miss → 401 (nunca fail-open). disabled/ revocación → 401.
export function authenticate(tokens: TokenIssuerPort, state: SessionStatePort): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token) {
      sendError(res, unauthenticated());
      return;
    }
    const claims = tokens.verifyAccess(token);
    if (!claims) {
      sendError(res, unauthenticated());
      return;
    }
    try {
      if (await state.isRevoked(claims.sid)) {
        sendError(res, unauthenticated());
        return;
      }
      if (!(await state.isUserActive(claims.sub))) {
        sendError(res, unauthenticated());
        return;
      }
    } catch {
      sendError(res, unauthenticated()); // fail-closed per-request
      return;
    }
    req.auth = { userId: claims.sub, sessionId: claims.sid, role: claims.role };
    next();
  };
}
