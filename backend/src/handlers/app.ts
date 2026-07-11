import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { LoginDeps } from '../domain/auth/login';
import type { LogoutDeps } from '../domain/auth/logout';
import type { RefreshDeps } from '../domain/auth/refresh';
import type { ListOrdersDeps } from '../domain/order/list-orders';
import type { OrderTransitionPort } from '../domain/order/transition-ports';
import type {
  ProbeResourceRepositoryPort,
  UserRepositoryPort,
} from '../domain/ports/repositories';
import type { SessionStatePort, TokenIssuerPort } from '../domain/ports/services';
import { createLogger } from '../infra/logger';
import { loginHandler } from './auth/login';
import { logoutHandler } from './auth/logout';
import { meHandler } from './auth/me';
import { refreshHandler } from './auth/refresh';
import type { CookieOptions } from './auth/cookies';
import { probeHandler } from './rbac/probe';
import { jsonErrorHandler } from './error-mapper';
import { listOrdersHandler } from './orders/list';
import { authenticate } from './middleware/authenticate';
import { authorizeProbe } from './middleware/authorize';
import { csrf, type SessionValidityPort } from './middleware/csrf';
import { requireRole } from './middleware/require-role';
import { correlation } from './middleware/correlation';
import { securityHeaders } from './middleware/security-headers';
import { healthHandler, readyHandler } from './ops';
import './http-types';

export interface AppDeps {
  readonly checkDb: () => Promise<boolean>;
  readonly loginDeps: LoginDeps;
  readonly logoutDeps: LogoutDeps;
  readonly refreshDeps: RefreshDeps;
  readonly users: UserRepositoryPort;
  readonly probes: ProbeResourceRepositoryPort;
  readonly tokens: TokenIssuerPort;
  readonly sessionState: SessionStatePort;
  readonly sessionValidity: SessionValidityPort;
  readonly orderListDeps: ListOrdersDeps;
  // 002b — dominio puro: puerto disponible para 003/004/005 (aún sin ruta montada).
  readonly orderTransition: OrderTransitionPort;
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
  app.post('/v1/auth/refresh', csrf(deps.sessionValidity), refreshHandler(deps.refreshDeps, deps.cookie));
  app.post('/v1/auth/logout', csrf(deps.sessionValidity), logoutHandler(deps.logoutDeps, deps.cookie));
  app.get('/v1/auth/me', authenticate(deps.tokens, deps.sessionState), meHandler(deps.users));

  // RBAC probe (/v1)
  app.get(
    '/v1/rbac/probe/:id',
    authenticate(deps.tokens, deps.sessionState),
    authorizeProbe(deps.probes),
    probeHandler,
  );

  // Orders (/v1) — listado por rol (002a)
  app.get(
    '/v1/orders',
    authenticate(deps.tokens, deps.sessionState),
    requireRole('dispatcher', 'technician', 'supervisor'),
    listOrdersHandler(deps.orderListDeps),
  );

  app.use(jsonErrorHandler);
  return app;
}
