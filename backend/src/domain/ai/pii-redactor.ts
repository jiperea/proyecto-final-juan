// Detector/redactor de PII ESTRUCTURADA (dominio puro — Constitution III; VIII/IX).
// Determinista y compartido entrada (FR-003b) y salida (FR-004a). Nombres/direcciones en texto
// libre NO se detectan aquí de forma fiable (best-effort por prompt+eval, BL-073).
//
// Tensión redacción vs fidelidad (K6): los patrones son "razonablemente específicos" con límites
// de palabra para acotar falsos positivos sobre datos operativos legítimos (nº de serie, matrícula
// de flota); el residual se acepta (VIII —minimización de PII— prima sobre fidelidad, ver spec).

export const REDACTED = '[REDACTED]';

// Patrones de PII estructurada. `g` para redactar todas las ocurrencias; límites de palabra donde aplica.
const PATTERNS: readonly RegExp[] = [
  // Email
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  // Teléfono: E.164 (+34...) o formato ES agrupado (≥9 dígitos). Tolera separadores comunes —espacio,
  // guion, punto y paréntesis— para no dejar huecos de formato (S-001: p. ej. `(600) 12 34 56`).
  /(?<!\d)(?:\+\d{1,3}[\s.-]?)?(?:\(?\d\)?[\s.-]?){8}\d(?!\d)/g,
  // DNI/NIF español: 8 dígitos + letra (con límites de palabra).
  /\b\d{8}[- ]?[A-HJ-NP-TV-Z]\b/gi,
  // NIE español: X/Y/Z + 7 dígitos + letra.
  /\b[XYZ][- ]?\d{7}[- ]?[A-HJ-NP-TV-Z]\b/gi,
  // Matrícula española actual: 4 dígitos + 3 consonantes (con límites de palabra).
  /\b\d{4}[- ]?[BCDFGHJKLMNPRSTVWXYZ]{3}\b/gi,
];

// Reemplaza por [REDACTED] toda PII estructurada detectada. Idempotente sobre texto ya redactado.
export function redactStructured(text: string): string {
  let out = text;
  for (const re of PATTERNS) {
    out = out.replace(re, REDACTED);
  }
  return out;
}

// ¿Contiene el texto PII estructurada detectable? (chequeo de salida, FR-004a).
export function hasStructuredPii(text: string): boolean {
  return PATTERNS.some((re) => {
    re.lastIndex = 0; // los patrones son globales; reiniciar antes de test()
    return re.test(text);
  });
}
