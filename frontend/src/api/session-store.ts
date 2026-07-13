// Estado de sesión en memoria (FR-003): access token NUNCA en storage. Expone un "epoch" que se
// incrementa en logout/cambio de rol para descartar respuestas en vuelo (FR-005/029).
let accessToken: string | null = null;
let epoch = 0;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function currentEpoch(): number {
  return epoch;
}

// Invalida la sesión actual: nuevo epoch (las respuestas en vuelo del epoch anterior se descartan)
// y borra el token de memoria.
export function invalidateSession(): void {
  epoch += 1;
  accessToken = null;
}
