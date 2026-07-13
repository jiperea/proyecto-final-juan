import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { LoginDeps } from '../domain/auth/login';
import type { LogoutDeps } from '../domain/auth/logout';
import type { RefreshDeps } from '../domain/auth/refresh';
import type { ListOrdersDeps } from '../domain/order/list-orders';
import type { OrderTransitionPort } from '../domain/order/write-side/transition-ports';
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
import { reassignOrderHandler, type ReassignHandlerDeps } from './orders/reassign';
import { startOrderWorkHandler } from './orders/start';
import type { StartOrderWorkDeps } from '../domain/order/write-side/start-order-work';
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
  // 004 — reasignación (write-side): visibilidad + lookup de técnico + puerto atómico de reasignación.
  readonly reassignDeps: ReassignHandlerDeps;
  // 005 — inicio de trabajo (write-side propio de 005).
  readonly startDeps: StartOrderWorkDeps;
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

  // Orders write-side (/v1) — reasignación (004). 401 vía authenticate; 403 FORBIDDEN_ROLE dentro del
  // handler (controla el orden 401→403→404→422 de FR-004).
  app.post(
    '/v1/orders/:orderId/reassignments',
    authenticate(deps.tokens, deps.sessionState),
    reassignOrderHandler(deps.reassignDeps),
  );

  // Orders write-side (/v1) — inicio de trabajo (005, US1). 401 (authenticate) → 403 (requireRole) →
  // 404 (pertenencia/uuid) → 422 (estado), en el handler delgado.
  app.post(
    '/v1/orders/:orderId/start',
    authenticate(deps.tokens, deps.sessionState),
    requireRole('technician'),
    startOrderWorkHandler(deps.startDeps),
  );

  app.use(jsonErrorHandler);
  return app;
}
