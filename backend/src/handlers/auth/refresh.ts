import type { RequestHandler } from 'express';
import { refresh, type RefreshDeps } from '../../domain/auth/refresh';
import { domainError } from '../../domain/result';
import type { LoginResponseDto } from '../contract/types';
import { sendError } from '../error-mapper';
import { REFRESH_COOKIE, setAuthCookies, type CookieOptions } from './cookies';

export function refreshHandler(deps: RefreshDeps, cookie: CookieOptions): RequestHandler {
  return async (req, res): Promise<void> => {
    const opaque = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    if (!opaque) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const result = await refresh(deps, { refreshTokenOpaque: opaque });
    if (!result.ok) {
      sendError(res, result.error);
      return;
    }
    setAuthCookies(res, result.value, cookie);
    const body: LoginResponseDto = {
      access_token: result.value.accessToken,
      token_type: 'Bearer',
      expires_in: result.value.expiresIn,
      user: result.value.identity,
    };
    res.status(200).json(body);
  };
}
