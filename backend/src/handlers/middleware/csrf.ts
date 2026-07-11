import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { domainError } from '../../domain/result';
import { CSRF_COOKIE, REFRESH_COOKIE } from '../auth/cookies';
import { sendError } from '../error-mapper';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ba, bb);
}

// CSRF double-submit (D2/FR-012/018) para endpoints de cookie (refresh/logout).
// Orden: SIN cookie de sesión → 401 (antes que CSRF); con sesión y CSRF inválido/ausente → 403.
export function csrf(): RequestHandler {
  return (req, res, next): void => {
    const cookies = req.cookies as Record<string, string> | undefined;
    if (!cookies?.[REFRESH_COOKIE]) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const csrfCookie = cookies[CSRF_COOKIE];
    const csrfHeader = req.header('x-csrf-token');
    if (!csrfCookie || !csrfHeader || !safeEqual(csrfCookie, csrfHeader)) {
      sendError(res, domainError('CSRF_INVALID', 'Token CSRF inválido o ausente.'));
      return;
    }
    next();
  };
}
