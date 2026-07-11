import type { RequestHandler } from 'express';
import { logout, type LogoutDeps } from '../../domain/auth/logout';
import { domainError } from '../../domain/result';
import { sendError } from '../error-mapper';
import { clearAuthCookies, REFRESH_COOKIE, type CookieOptions } from './cookies';

export function logoutHandler(deps: LogoutDeps, cookie: CookieOptions): RequestHandler {
  return async (req, res): Promise<void> => {
    const opaque = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!opaque) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const result = await logout(deps, { refreshTokenOpaque: opaque });
    if (!result.ok) {
      sendError(res, result.error);
      return;
    }
    clearAuthCookies(res, cookie);
    res.status(204).send();
  };
}
