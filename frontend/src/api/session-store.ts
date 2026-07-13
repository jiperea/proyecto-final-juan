import type { Role } from './types';

// Estado de sesión en memoria (FR-003): access token NUNCA en storage. Expone un "epoch" que se
// incrementa en logout/cambio de rol para descartar respuestas en vuelo (FR-005/029) y notifica
// a los suscriptores (el SessionProvider) para re-montar o purgar.
let accessToken: string | null = null;
let epoch = 0;
let currentRole: Role | null = null;

type SessionEvent = 'invalidated' | 'role-changed';
const listeners = new Set<(e: SessionEvent, role?: Role) => void>();

export function subscribeSession(fn: (e: SessionEvent, role?: Role) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(e: SessionEvent, role?: Role): void {
  for (const fn of listeners) fn(e, role);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setCurrentRole(role: Role | null): void {
  currentRole = role;
}

export function currentEpoch(): number {
  return epoch;
}

// Cambio de rol detectado en un refresh (FR-029): invalida en vuelo y notifica para re-montar.
export function notifyRoleChange(role: Role): void {
  if (currentRole !== null && role !== currentRole) {
    epoch += 1;
    currentRole = role;
    emit('role-changed', role);
  } else {
    currentRole = role;
  }
}

// Invalida la sesión actual: nuevo epoch (respuestas en vuelo del epoch anterior se descartan),
// borra el token y el rol, y notifica (FR-005).
export function invalidateSession(): void {
  epoch += 1;
  accessToken = null;
  currentRole = null;
  emit('invalidated');
}
