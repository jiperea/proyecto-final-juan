import { csrfHeaders } from './csrf';
import { refreshOnce } from './refresh';
import { currentEpoch, getAccessToken, invalidateSession } from './session-store';
import { FALLBACK_MESSAGE, OFFLINE_MESSAGE, messageForCode } from '../i18n/errors';
import type { ErrorResponse } from './types';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly userMessage: string,
  ) {
    super(code ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

// Petición abortada por cambio de sesión (logout/cambio de rol): su respuesta se descarta (FR-005/029).
export class SessionChangedError extends Error {
  constructor() {
    super('session-changed');
    this.name = 'SessionChangedError';
  }
}

interface Options {
  method?: string;
  body?: unknown;
  auth?: boolean; // adjunta Authorization + Cache-Control:no-store
  cookieEndpoint?: boolean; // adjunta CSRF double-submit (refresh/logout)
}

async function raw(path: string, opts: Options): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth !== false) {
    headers['Cache-Control'] = 'no-store';
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  if (opts.cookieEndpoint) Object.assign(headers, csrfHeaders());
  return fetch(path, {
    method: opts.method ?? 'GET',
    headers,
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

async function parseError(res: Response): Promise<ApiError> {
  let code: string | undefined;
  try {
    const body = (await res.json()) as ErrorResponse;
    code = (body as { code?: string }).code;
  } catch {
    code = undefined;
  }
  const msg = code ? messageForCode(code) : FALLBACK_MESSAGE;
  return new ApiError(res.status, code, msg);
}

// apiFetch: token en memoria, no-store, CSRF en endpoints de cookie, 401→refresh(dedup)+reintento único,
// descarte de respuestas en vuelo tras cambio de sesión, y superficie de error mapeada.
export async function apiFetch<T>(path: string, opts: Options = {}): Promise<T> {
  const startEpoch = currentEpoch();
  let res: Response;
  try {
    res = await raw(path, opts);
  } catch {
    throw new ApiError(0, undefined, OFFLINE_MESSAGE); // sin respuesta HTTP (offline/timeout)
  }
  if (currentEpoch() !== startEpoch) throw new SessionChangedError();

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshOnce();
    if (currentEpoch() !== startEpoch) throw new SessionChangedError();
    if (!refreshed) {
      // FR-004: renovación fallida → invalida la sesión (SessionProvider pasa a anónimo → /login,
      // conservando la ruta) en vez de dejar la vista con un error reintentable.
      invalidateSession();
      throw new ApiError(401, 'UNAUTHENTICATED', messageForCode('UNAUTHENTICATED'));
    }
    // reintento único con el nuevo access
    try {
      res = await raw(path, opts);
    } catch {
      throw new ApiError(0, undefined, OFFLINE_MESSAGE);
    }
    if (currentEpoch() !== startEpoch) throw new SessionChangedError();
    if (res.status === 401) {
      // segundo 401 tras refresh exitoso: no reintentar en bucle → invalidar → login.
      invalidateSession();
      throw new ApiError(401, 'UNAUTHENTICATED', messageForCode('UNAUTHENTICATED'));
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
