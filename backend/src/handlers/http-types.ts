import type { Logger } from 'pino';
import type { Role } from '../domain/model';

// Contexto de autenticación inyectado por el middleware `authenticate`.
export interface AuthContext {
  readonly userId: string;
  readonly sessionId: string;
  readonly role: Role;
}

// Augmentación de Express Request (correlation-id, logger por-request, auth).
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      log: Logger;
      correlationId: string;
      auth?: AuthContext;
    }
  }
}

export {};
