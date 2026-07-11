import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { LoginDeps } from '../domain/auth/login';
import type { LogoutDeps } from '../domain/auth/logout';
import type { UserRepositoryPort } from '../domain/ports/repositories';
import type { SessionStatePort, TokenIssuerPort } from '../domain/ports/services';
import { createLogger } from '../infra/logger';
import { loginHandler } from './auth/login';
import { logoutHandler } from './auth/logout';
import { meHandler } from './auth/me';
import type { CookieOptions } from './auth/cookies';
import { jsonErrorHandler } from './error-mapper';
import { authenticate } from './middleware/authenticate';
import { correlation } from './middleware/correlation';
import { securityHeaders } from './middleware/security-headers';
import { healthHandler, readyHandler } from './ops';
import './http-types';

export interface AppDeps {
  readonly checkDb: () => Promise<boolean>;
  readonly loginDeps: LoginDeps;
  readonly logoutDeps: LogoutDeps;
  readonly users: UserRepositoryPort;
  readonly tokens: TokenIssuerPort;
  readonly sessionState: SessionStatePort;
  readonly cookie: CookieOptions;
}

// Ensambla la app HTTP (hexagonal: handlers reciben dependencias por inyección).
export function buildApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders());
  app.use(correlation(createLogger()));
  app.use(cookieParser());
  app.use(express.json());

  // Ops (fuera de /v1)
  app.get('/health', healthHandler);
  app.get('/ready', readyHandler(deps.checkDb));

  // Auth (/v1)
  app.post('/v1/auth/login', loginHandler(deps.loginDeps, deps.cookie));
  app.post('/v1/auth/logout', logoutHandler(deps.logoutDeps, deps.cookie));
  app.get('/v1/auth/me', authenticate(deps.tokens, deps.sessionState), meHandler(deps.users));

  app.use(jsonErrorHandler);
  return app;
}
