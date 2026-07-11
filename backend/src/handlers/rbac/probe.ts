import type { Request, Response } from 'express';
import type { ProbeResponseDto } from '../contract/types';

// Handler del recurso de prueba: sólo se alcanza si authorizeProbe autorizó (200).
export function probeHandler(req: Request, res: Response): void {
  const body: ProbeResponseDto = { id: req.params.id ?? '', ok: true };
  res.status(200).json(body);
}
