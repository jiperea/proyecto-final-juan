import helmet from 'helmet';

// Cabeceras de seguridad web base (FR-012): HSTS, CSP, nosniff, frame DENY, referrer no-referrer.
export function securityHeaders(): ReturnType<typeof helmet> {
  return helmet({
    hsts: { maxAge: 15552000, includeSubDomains: true },
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"] } },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'no-referrer' },
  });
}
