import type { Response } from 'express';
import type { IssuedTokens } from '../../domain/ports/services';

export const REFRESH_COOKIE = 'refresh_token';
export const CSRF_COOKIE = 'csrf_token';
export const COOKIE_PATH = '/v1/auth';

export interface CookieOptions {
  readonly refreshMaxAgeMs: number;
  readonly secure: boolean;
}

// refresh: HttpOnly (resistente a XSS). csrf: legible por JS (double-submit). Ambas SameSite=Strict (D1/D2).
export function setAuthCookies(res: Response, tokens: IssuedTokens, opts: CookieOptions): void {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: opts.secure,
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: opts.refreshMaxAgeMs,
  });
  res.cookie(CSRF_COOKIE, tokens.csrfToken, {
    httpOnly: false,
    secure: opts.secure,
    sameSite: 'strict',
    path: COOKIE_PATH,
    maxAge: opts.refreshMaxAgeMs,
  });
}

export function clearAuthCookies(res: Response, opts: CookieOptions): void {
  const base = { secure: opts.secure, sameSite: 'strict', path: COOKIE_PATH } as const;
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, ...base });
  res.clearCookie(CSRF_COOKIE, { httpOnly: false, ...base });
}
