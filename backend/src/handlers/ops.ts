import type { Request, RequestHandler, Response } from 'express';

// /health (liveness) y /ready (readiness con chequeo de BD) — FR-015. Fuera de /v1.
export function healthHandler(_req: Request, res: Response): void {
  res.status(200).json({ status: 'ok' });
}

export function readyHandler(checkDb: () => Promise<boolean>): RequestHandler {
  return async (_req, res): Promise<void> => {
    const up = await checkDb().catch(() => false);
    if (up) {
      res.status(200).json({ status: 'ready', checks: { database: 'up' } });
    } else {
      res.status(503).json({ status: 'not_ready', checks: { database: 'down' } });
    }
  };
}
