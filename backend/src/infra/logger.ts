import { pino, type DestinationStream, type Logger } from 'pino';

// Logging estructurado con REDACCIÓN (FR-014, S-001): nunca PII, contraseñas ni tokens en logs.
const REDACT_PATHS = [
  'password',
  'identifier',
  'authorization',
  'access_token',
  'refresh_token',
  'csrf_token',
  'title', // Order: texto libre con posible PII de cliente (FR-017)
  'description',
  'reason', // OrderAudit: motivo pre-saneado, nunca en logs ni en errores (FR-008/SC-006)
  'notes', // 005: notas de ejecución = payload PII; nunca en logs ni en errores (FR-005/SC-007)
  'object_ref', // 005: referencia de evidencia potencialmente PII; en logs sólo id/conteo (FR-005/SC-007)
  'summary', // 007: resumen IA (posible PII residual); nunca en logs (FR-005). El evento de acceso NO lo lleva.
  'prompt', // 007: prompt minimizado al proveedor; nunca en logs (FR-005/H-002)
  '*.title',
  '*.description',
  '*.reason',
  '*.notes',
  '*.object_ref',
  '*.summary',
  '*.prompt',
  'orders[*].title', // forma real de la respuesta listOrders: { orders: [{ title, description }] }
  'orders[*].description',
  '*.orders[*].title',
  '*.orders[*].description',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'req.body.reason', // 004: reason anidado en el body real del endpoint de reasignación (FR-009)
  'req.body.title',
  'req.body.description',
  'req.body.notes', // 005: notas anidadas en el body de ejecución (FR-005)
  'req.body.evidence[*].object_ref', // 005: object_ref anidado en cada evidencia del body (FR-005)
  'err.reason', // 004: reason que pudiera colarse por error.cause/serialización de error
  'err.notes', // 005: notas que pudieran colarse por error.cause/serialización
  'err.cause.notes',
  'err.cause.object_ref',
  '*.err.reason',
  '*.err.notes',
  '*.password',
  '*.identifier',
  '*.access_token',
  '*.refresh_token',
  '*.csrf_token',
];

export function createLogger(opts?: { stream?: DestinationStream }): Logger {
  const options = { redact: { paths: REDACT_PATHS, censor: '[Redacted]' } };
  return opts?.stream ? pino(options, opts.stream) : pino(options);
}
