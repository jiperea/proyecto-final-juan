import { pino, type DestinationStream, type Logger } from 'pino';

// Logging estructurado con REDACCIÓN (FR-014, S-001): nunca PII, contraseñas ni tokens en logs.
const REDACT_PATHS = [
  'password',
  'identifier',
  'authorization',
  'access_token',
  'refresh_token',
  'csrf_token',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
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
