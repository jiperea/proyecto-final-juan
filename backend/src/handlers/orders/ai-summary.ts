import type { RequestHandler, Response } from 'express';
import {
  summarizeOrderIncident,
  type SummarizeThresholds,
} from '../../domain/ai/summarize-order-incident';
import type {
  AccessLogPort,
  AiSummaryProviderPort,
  DeniedReason,
  IncidentSourcePort,
} from '../../domain/ai/summary-ports';
import type { RateLimitPort } from '../../domain/ports/services';
import { domainError, isDomainError, type DomainError } from '../../domain/result';
import type { AuthContext } from '../http-types';
import type { IncidentSummaryResponseDto } from '../contract/order-types';
import { sendError } from '../error-mapper';
import { UUID_RE, orderNotFound } from './order-http';
import '../http-types';

export interface SummarizeIncidentHandlerDeps {
  readonly source: IncidentSourcePort;
  readonly provider: AiSummaryProviderPort;
  readonly accessLog: AccessLogPort;
  readonly rateLimit: RateLimitPort;
  readonly thresholds: SummarizeThresholds;
}

interface Denial {
  readonly reason: DeniedReason;
  readonly error: DomainError;
}

// Guards de rol + rate-limit (K5). Devuelve la denegación o `null` si pasa (registrando la petición
// contra la ventana). Precedencia 403 (rol) → 429 (rate-limit), FR-012.
function evaluateGuards(deps: SummarizeIncidentHandlerDeps, auth: AuthContext): Denial | null {
  if (auth.role !== 'supervisor') {
    return { reason: 'role_403', error: domainError('FORBIDDEN_ROLE', 'No autorizado para esta acción.') };
  }
  const key = deps.rateLimit.keyForIdentifier(auth.userId);
  const decision = deps.rateLimit.check(key);
  if (decision.locked) {
    return {
      reason: 'rate_limited_429',
      error: domainError('RATE_LIMITED', 'Demasiadas peticiones de resumen.', {
        retryAfterSeconds: decision.retryAfterSeconds,
      }),
    };
  }
  deps.rateLimit.registerFailure(key); // cuenta esta petición (10/60s por usuario)
  return null;
}

// Emite el evento `denied` (con su deniedReason) y responde el error correspondiente (K5).
function respondDenied(
  accessLog: AccessLogPort,
  res: Response,
  auth: AuthContext,
  orderId: string,
  d: Denial,
): void {
  accessLog.record({ actor: auth.userId, orderId, outcome: 'denied', deniedReason: d.reason });
  sendError(res, d.error);
}

// Error atrapado (outcome=error): un DomainError propagado (p. ej. SERVICE_UNAVAILABLE de la fuente ante BD
// caída, 503 declarado) se responde con su código; cualquier otro error inesperado → 500 genérico (sin
// filtrar Postgres/proveedor).
function respondError(accessLog: AccessLogPort, res: Response, auth: AuthContext, orderId: string, e: unknown): void {
  accessLog.record({ actor: auth.userId, orderId, outcome: 'error' });
  if (isDomainError(e)) {
    sendError(res, e);
    return;
  }
  sendError(res, domainError('INTERNAL', 'Error interno.', {
    agentAction: 'Reintenta más tarde; si persiste, contacta soporte.',
  }));
}

// POST /v1/orders/:orderId/ai-summary — solo supervisor. app.ts monta SÓLO `authenticate` (401 sin actor,
// sin evento). Los GUARDS viven AQUÍ (K5) para emitir el evento de acceso `denied` en cada rechazo.
// Precedencia FR-012: 401 → 403 (rol) → 429 (rate-limit) → 404 (visibilidad) → proveedor (503 | 200).
export function summarizeIncidentHandler(deps: SummarizeIncidentHandlerDeps): RequestHandler {
  return async (req, res): Promise<void> => {
    const auth = req.auth;
    if (!auth) {
      sendError(res, domainError('UNAUTHENTICATED', 'No autenticado.'));
      return; // sin actor → sin evento (lo cubre auth de 001)
    }
    const orderId = req.params.orderId ?? '';

    const denial = evaluateGuards(deps, auth);
    if (denial) {
      respondDenied(deps.accessLog, res, auth, orderId, denial);
      return;
    }
    if (!UUID_RE.test(orderId)) {
      respondDenied(deps.accessLog, res, auth, orderId, { reason: 'not_visible_404', error: orderNotFound() });
      return;
    }

    try {
      const source = await deps.source.findSummarizable(orderId);
      if (source === null) {
        respondDenied(deps.accessLog, res, auth, orderId, { reason: 'not_visible_404', error: orderNotFound() });
        return;
      }
      const result = await summarizeOrderIncident(
        { provider: deps.provider, thresholds: deps.thresholds },
        { source },
      );
      if (!result.ok) {
        deps.accessLog.record({ actor: auth.userId, orderId, outcome: 'error' }); // 503 (M1)
        sendError(res, result.error);
        return;
      }
      const r = result.value;
      deps.accessLog.record({ actor: auth.userId, orderId, outcome: r.outcome });
      const body: IncidentSummaryResponseDto = { summary: r.summary, sufficient: r.sufficient };
      res.status(200).json(body);
    } catch (e) {
      respondError(deps.accessLog, res, auth, orderId, e);
    }
  };
}
