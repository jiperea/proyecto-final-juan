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
import { getOrderDetailHandler, type GetOrderDetailDeps } from './orders/get-order-detail';
import { authWithDeniedAccessLog } from './middleware/auth-denied-log';
import { reassignOrderHandler, type ReassignHandlerDeps } from './orders/reassign';
import { startOrderWorkHandler } from './orders/start';
import type { StartOrderWorkDeps } from '../domain/order/write-side/start-order-work';
import { submitOrderExecutionHandler } from './orders/execution';
import type { SubmitExecutionDeps } from '../domain/order/write-side/submit-execution';
import { reviewOrderHandler } from './orders/review';
import type { ReviewOrderDeps } from '../domain/order/write-side/review-order';
import { summarizeIncidentHandler, type SummarizeIncidentHandlerDeps } from './orders/ai-summary';
import { uploadEvidenceHandler, type UploadEvidenceDeps } from './orders/upload-evidence';
import { getOrderEvidenceHandler, type GetEvidenceDeps } from './orders/get-evidence';
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
  // 005 — registro de ejecución (write-side propio de 005).
  readonly executionDeps: SubmitExecutionDeps;
  // 006 — revisión del supervisor (write-side propio de 006).
  readonly reviewDeps: ReviewOrderDeps;
  // 007 — resumen de incidencia por IA (guards dentro del handler, K5).
  readonly summaryDeps: SummarizeIncidentHandlerDeps;
  // 008/#010 — detalle de orden (read-side): reader snapshot + pii-redactor + logger de accesos denegados.
  readonly orderDetailDeps: GetOrderDetailDeps;
  // 024 — subida de evidencia (uploadOrderEvidence, US1): StoragePort + lookup de autz-primero/tope staging.
  readonly uploadEvidenceDeps: UploadEvidenceDeps;
  // 024 — lectura de evidencia (getOrderEvidence, US2): reader (autz heredada) + StoragePort + logger denegado.
  readonly getEvidenceDeps: GetEvidenceDeps;
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

  registerOrderRoutes(app, deps);

  app.use(jsonErrorHandler);
  return app;
}

// Rutas /v1/orders (002a listado + 004 reasignación + 005 start/execution + 006 review). Extraído de buildApp
// para acotar su tamaño (max-lines-per-function). 401 via authenticate; 403 via requireRole o dentro del handler.
function registerOrderRoutes(app: Express, deps: AppDeps): void {
  const auth = authenticate(deps.tokens, deps.sessionState);
  // Listado por rol (002a).
  app.get('/v1/orders', auth, requireRole('dispatcher', 'technician', 'supervisor'), listOrdersHandler(deps.orderListDeps));
  // Detalle por rol (008/#010): SOLO auth (sin requireRole — un 403 sobre un orderId revelaría existencia;
  // la visibilidad filtra a 404 dentro del handler). authWithDeniedAccessLog emite el 401 (FR-009); el
  // handler emite el 404 (con actor). Precedencia 401→404; orderId malformado → 404.
  app.get(
    '/v1/orders/:orderId',
    authWithDeniedAccessLog(auth, deps.orderDetailDeps.deniedLogger),
    getOrderDetailHandler(deps.orderDetailDeps),
  );
  // Reasignación (004): 403 FORBIDDEN_ROLE dentro del handler (orden 401→403→404→422 de FR-004).
  app.post('/v1/orders/:orderId/reassignments', auth, reassignOrderHandler(deps.reassignDeps));
  // Subida de evidencia (024, US1): SOLO `auth` (sin requireRole, igual que getOrderDetail); autz-primero
  // (dueño+in_progress) y 404 uniforme resueltos DENTRO del handler (FR-020). authWithDeniedAccessLog emite
  // el 401 (S-003, misma señal best-effort que getOrderDetail/getOrderEvidence); el handler emite el 404.
  app.post(
    '/v1/orders/:orderId/evidence',
    authWithDeniedAccessLog(auth, deps.uploadEvidenceDeps.deniedLogger, 'uploadOrderEvidence'),
    uploadEvidenceHandler(deps.uploadEvidenceDeps),
  );
  // Lectura de evidencia (024, US2): SOLO `auth` (sin requireRole, autz heredada EXACTA de getOrderDetail,
  // FR-003); 401 vía authWithDeniedAccessLog (endpoint propio), 404/410 dentro del handler (FR-007/FR-009).
  app.get(
    '/v1/orders/:orderId/evidence/:evidenceId',
    authWithDeniedAccessLog(auth, deps.getEvidenceDeps.deniedLogger, 'getOrderEvidence'),
    getOrderEvidenceHandler(deps.getEvidenceDeps),
  );
  // Inicio de trabajo (005, US1): 401→403→404 (pertenencia/uuid)→422 (estado).
  app.post('/v1/orders/:orderId/start', auth, requireRole('technician'), startOrderWorkHandler(deps.startDeps));
  // Registro de ejecución (005, US2): 401→403→422 (payload)→404 (pertenencia)→422 (estado).
  app.post('/v1/orders/:orderId/execution', auth, requireRole('technician'), submitOrderExecutionHandler(deps.executionDeps));
  // Revisión del supervisor (006): 401→403→422 (VALIDATION_ERROR/INVALID_REASON)→404 (no visible)→409 (evidencia).
  app.post('/v1/orders/:orderId/review', auth, requireRole('supervisor'), reviewOrderHandler(deps.reviewDeps));
  // Resumen de incidencia por IA (007): SÓLO `auth`; rol/rate-limit/visibilidad los aplica el handler para
  // emitir el evento de acceso `denied` en cada rechazo (K5). Precedencia 401→403→429→404→proveedor.
  app.post('/v1/orders/:orderId/ai-summary', auth, summarizeIncidentHandler(deps.summaryDeps));
}
