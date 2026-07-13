import { apiFetch } from '../../api/client';
import { invalidateSession, setAccessToken } from '../../api/session-store';
import { toSessionUser } from '../../api/types';
import type { SessionUser, UserIdentity } from '../../api/types';

interface AuthResponse {
  access_token: string;
  user: UserIdentity;
}

// FR-001/002: login. En 401 el contrato devuelve credenciales inválidas (mensaje genérico en la UI).
export async function login(identifier: string, password: string): Promise<SessionUser> {
  const body = await apiFetch<AuthResponse>('/v1/auth/login', {
    method: 'POST',
    auth: false,
    body: { identifier, password },
  });
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
