import type { RequestHandler } from 'express';
import { login, type LoginDeps } from '../../domain/auth/login';
import { domainError } from '../../domain/result';
import { loginRequestSchema } from '../contract/schemas';
import type { LoginResponseDto } from '../contract/types';
import { sendError } from '../error-mapper';
import { setAuthCookies, type CookieOptions } from './cookies';

export function loginHandler(deps: LoginDeps, cookie: CookieOptions): RequestHandler {
  return async (req, res): Promise<void> => {
    const parsed = loginRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0])).filter(Boolean))];
      sendError(
        res,
        domainError('VALIDATION_ERROR', 'Datos de entrada inválidos.', { details: { fields } }),
      );
      return;
    }
    const result = await login(deps, parsed.data);
    if (!result.ok) {
      sendError(res, result.error);
      return;
    }
    setAuthCookies(res, result.value.tokens, cookie);
    const body: LoginResponseDto = {
      access_token: result.value.tokens.accessToken,
      token_type: 'Bearer',
      expires_in: result.value.tokens.expiresIn,
      user: result.value.identity,
    };
    res.status(200).json(body);
  };
}
