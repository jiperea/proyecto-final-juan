import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { domainError } from '../../domain/result';
import { CSRF_COOKIE, REFRESH_COOKIE } from '../auth/cookies';
import { sendError } from '../error-mapper';

// Comprueba si la cookie de refresh corresponde a una sesión VÁLIDA (existe, no revocada, no caducada).
// Permite al middleware CSRF respetar el orden 401(sesión)→403(CSRF) de FR-018.
export interface SessionValidityPort {
  isSessionValid(refreshOpaque: string): Promise<boolean>;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ba, bb);
}

// CSRF double-submit (D2/FR-012/018) para endpoints de cookie (refresh/logout).
// Orden: SIN cookie → 401. Con CSRF válido → continúa (el handler valida la sesión).
// Con CSRF inválido/ausente → 401 si la sesión NO es válida (caducada/revocada), 403 si la sesión es válida.
export function csrf(validity: SessionValidityPort): RequestHandler {
  return async (req, res, next): Promise<void> => {
    const cookies = req.cookies as Record<string, string> | undefined;
    const opaque = cookies?.[REFRESH_COOKIE];
    if (!opaque) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const csrfCookie = cookies?.[CSRF_COOKIE];
    const csrfHeader = req.header('x-csrf-token');
    const csrfOk = !!csrfCookie && !!csrfHeader && safeEqual(csrfCookie, csrfHeader);
    if (csrfOk) {
      next();
      return;
    }
    // CSRF falla: la sesión (401) se comprueba ANTES que el CSRF (403) — FR-018.
    let sessionValid = false;
    try {
      sessionValid = await validity.isSessionValid(opaque);
    } catch {
      sessionValid = false; // fail-closed: si no podemos validar, denegamos
    }
    sendError(
      res,
      sessionValid
        ? domainError('CSRF_INVALID', 'Token CSRF inválido o ausente.')
        : domainError('UNAUTHENTICATED', 'No autenticado.'),
    );
  };
}
