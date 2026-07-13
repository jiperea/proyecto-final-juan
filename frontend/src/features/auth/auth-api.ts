import { apiFetch } from '../../api/client';
import { currentEpoch, invalidateSession, setAccessToken } from '../../api/session-store';
import { toSessionUser } from '../../api/types';
import type { SessionUser, UserIdentity } from '../../api/types';

export class LoginSupersededError extends Error {
  constructor() {
    super('login-superseded');
    this.name = 'LoginSupersededError';
  }
}

interface AuthResponse {
  access_token: string;
  user: UserIdentity;
}

// FR-001/002: login. En 401 el contrato devuelve credenciales inválidas (mensaje genérico en la UI).
export async function login(identifier: string, password: string): Promise<SessionUser> {
  const startEpoch = currentEpoch();
  const body = await apiFetch<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    auth: false,
    body: { identifier, password },
  });
  // S-004: si la sesión cambió durante el login en vuelo (p. ej. un logout), no apliques el token —
  // respeta la intención más reciente del usuario (misma guarda de epoch que refresh.ts).
  if (currentEpoch() !== startEpoch) throw new LoginSupersededError();
  setAccessToken(body.access_token);
  return toSessionUser(body.user);
}

// FR-001/023/029: identidad actual.
export async function fetchMe(): Promise<SessionUser> {
  const body = await apiFetch<{ user: UserIdentity }>('/v1/auth/me');
  return toSessionUser(body.user);
}

// FR-005: logout best-effort. Pase lo que pase, se invalida la sesión local (purga + descarte in-flight).
export async function logout(): Promise<void> {
  try {
    await apiFetch<void>('/v1/auth/logout', { method: 'POST', cookieEndpoint: true });
  } catch {
    // best-effort: red/401/403/5xx no bloquean al usuario
  } finally {
    invalidateSession();
  }
}
