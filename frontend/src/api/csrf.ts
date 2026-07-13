// CSRF double-submit (FR-022): lee la cookie csrf_token (legible por JS) para enviarla en X-CSRF-Token
// en los endpoints protegidos por cookie (refresh, logout). Orden server-side: sesión 401 antes que CSRF 403.
export function readCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]!) : null;
}

export function csrfHeaders(): Record<string, string> {
  const token = readCsrfToken();
  return token ? { 'X-CSRF-Token': token } : {};
}
