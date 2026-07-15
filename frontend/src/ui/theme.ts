// FE-5 (017) · Tema CSS-first. Fuente de verdad única de la preferencia de tema.
// El script inline anti-FOUC de index.html DUPLICA a mano esta clave/valores (no puede importar TS antes
// del bundle); el test theme-fouc-sync verifica que no divergen (FR-013/H-006).
export const THEME_STORAGE_KEY = 'fieldops.theme';
export const THEME_CHOICES = ['light', 'dark', 'system'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

function isChoice(v: unknown): v is ThemeChoice {
  return typeof v === 'string' && (THEME_CHOICES as readonly string[]).includes(v);
}

// Lee la elección persistida; degrada a 'system' si localStorage no está disponible o el valor es inválido.
export function getStoredChoice(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isChoice(v) ? v : 'system';
  } catch {
    return 'system';
  }
}

// Aplica la elección al DOM: 'light'/'dark' → data-theme; 'system' → elimina el atributo (gobierna @media).
// NO calcula el tema "resuelto" ni usa matchMedia/getComputedStyle (eso es CSS puro, FR-004).
export function applyChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

// Persiste la elección (sólo esta clave). Si escribir falla (modo privado/cuota), no lanza: el tema ya se
// aplicó en el DOM para la sesión (FR-004b/FR-016).
export function persistChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* degradación aceptable: tema aplicado sólo en memoria/DOM */
  }
}

// Cambio disparado por el conmutador: aplica + persiste en un paso.
export function setChoice(choice: ThemeChoice): void {
  applyChoice(choice);
  persistChoice(choice);
}

// Sincroniza entre pestañas: cuando otra pestaña cambia la clave, reaplica en ésta (FR-004b).
export function subscribeToStorage(onChange: (choice: ThemeChoice) => void): () => void {
  const handler = (e: StorageEvent) => {
    if (e.key !== null && e.key !== THEME_STORAGE_KEY) return;
    const choice = getStoredChoice();
    applyChoice(choice);
    onChange(choice);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
