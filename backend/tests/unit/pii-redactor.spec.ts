// T005/T024 (007, Foundational) — redactor de PII estructurada (dominio puro).
// FR-003b (entrada) / FR-004a (salida). Nombres/direcciones NO se detectan (best-effort, BL-073).
import { describe, expect, it } from 'vitest';
import { REDACTED, hasStructuredPii, redactStructured } from '../../src/domain/ai/pii-redactor';

describe('pii-redactor: redactStructured', () => {
  it('redacta email, teléfono, DNI, NIE y matrícula española', () => {
    expect(redactStructured('correo ana@example.com aquí')).toContain(REDACTED);
    expect(redactStructured('llama al +34 612 345 678')).toContain(REDACTED);
    expect(redactStructured('DNI 12345678Z')).toContain(REDACTED);
    expect(redactStructured('NIE X1234567L')).toContain(REDACTED);
    expect(redactStructured('matrícula 1234 BCD')).toContain(REDACTED);
  });

  it('no toca texto operativo sin PII (idempotente sobre texto limpio)', () => {
    const clean = 'El compresor no arranca; se sustituyó el relé y quedó operativo.';
    expect(redactStructured(clean)).toBe(clean);
  });

  it('es idempotente sobre texto ya redactado', () => {
    const once = redactStructured('email juan@x.com');
    expect(redactStructured(once)).toBe(once);
  });

  it('K6 (falso positivo aceptado, documentado): patrones específicos pero no exentos — un nº de serie con forma de matrícula/DNI PUEDE sobre-redactarse; se prioriza VIII (minimización) sobre fidelidad', () => {
    // Nº de serie tipo matrícula flota "1234 BCD" cae en el patrón: se acepta el residual (spec §K6).
    const serial = 'equipo con serie 1234 BCD';
    expect(redactStructured(serial)).toContain(REDACTED);
    // Un nº de serie SIN forma de PII estructurada NO se toca.
    const serial2 = 'equipo con serie SN-ACME-00042';
    expect(redactStructured(serial2)).toBe(serial2);
  });
});

describe('pii-redactor: hasStructuredPii', () => {
  it('detecta PII estructurada en la salida (FR-004a)', () => {
    expect(hasStructuredPii('contacto: 12345678Z')).toBe(true);
    expect(hasStructuredPii('escribe a a.b@c.io')).toBe(true);
  });

  it('devuelve false para texto sin PII estructurada (nombres/direcciones NO cuentan, BL-073)', () => {
    expect(hasStructuredPii('El cliente Juan indicó que la puerta del garaje no cierra.')).toBe(false);
  });

  it('es estable llamado varias veces (los patrones globales se reinician)', () => {
    const t = 'DNI 12345678Z';
    expect(hasStructuredPii(t)).toBe(true);
    expect(hasStructuredPii(t)).toBe(true);
  });
});
