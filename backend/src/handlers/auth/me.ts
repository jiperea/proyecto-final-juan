import type { RequestHandler } from 'express';
import { toIdentity } from '../../domain/model';
import type { UserRepositoryPort } from '../../domain/ports/repositories';
import { domainError } from '../../domain/result';
import type { MeResponseDto } from '../contract/types';
import { sendError } from '../error-mapper';
import '../http-types';

export function meHandler(users: UserRepositoryPort): RequestHandler {
  return async (req, res): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const user = await users.findById(auth.userId);
    if (!user) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return;
    }
    const body: MeResponseDto = { user: toIdentity(user) };
    res.status(200).json(body);
  };
}
