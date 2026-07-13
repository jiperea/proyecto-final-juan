import { csrfHeaders } from './csrf';
import { notifyRoleChange, setAccessToken } from './session-store';
import type { Role } from './types';

export interface RefreshResult {
  role: Role | undefined;
}

// Dedup del refresh (FR-004): todas las peticiones con 401 concurrente comparten UNA promesa.
// El refresh es single-use con rotación atómica; nunca debe dispararse dos veces en paralelo.
let inFlight: Promise<RefreshResult | null> | null = null;

async function doRefresh(): Promise<RefreshResult | null> {
  try {
    const res = await fetch('/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Cache-Control': 'no-store', ...csrfHeaders() },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { access_token?: string; user?: { role?: Role } };
    if (!body.access_token) return null;
    setAccessToken(body.access_token);
    // FR-029: el contrato relee el rol de BD al rotar; si cambió, notifica para re-montar el shell.
    if (body.user?.role) notifyRoleChange(body.user.role);
    return { role: body.user?.role };
  } catch {
    return null; // fallo de red → tratado como refresh fallido
  }
}

export function refreshOnce(): Promise<RefreshResult | null> {
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
