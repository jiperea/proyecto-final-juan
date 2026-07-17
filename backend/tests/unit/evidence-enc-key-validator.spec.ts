// 026 (T001 · FR-013) — Fase RED. Validador COMPARTIDO de `EVIDENCE_ENC_KEY` (presente, ≥32 chars), única
// fuente de verdad reutilizada por `config.ts` (13 campos) y por el seed (que NO debe invocar `loadConfig()`
// completo, FR-003). Este fichero AÚN NO EXISTE — lo crea `dev-backend` en
// `backend/src/infra/evidence-enc-key.ts`, exportando (contrato esperado):
//   export const EVIDENCE_ENC_KEY_MIN_LENGTH = 32;
//   export function isValidEvidenceEncKey(value: unknown): value is string;
// Hasta entonces, el import de más abajo falla y TODO el fichero es rojo por la razón correcta (el
// validador compartido no existe todavía).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/infra/config';
import { EVIDENCE_ENC_KEY_MIN_LENGTH, isValidEvidenceEncKey } from '../../src/infra/evidence-enc-key';

// Entorno mínimo válido para loadConfig() (mismo patrón que tests/unit/config.spec.ts).
const base: Record<string, string> = {
  JWT_SECRET: 'a'.repeat(40),
  CSRF_HMAC_SECRET: 'b'.repeat(40),
  LOCKOUT_HMAC_SECRET: 'c'.repeat(40),
  DATABASE_URL: 'postgresql://fieldops:fieldops@localhost:5432/fieldops',
  ACCESS_TTL: '900',
  REFRESH_TTL_DAYS: '7',
  GRACE_MS: '10000',
  LOCKOUT_MAX: '5',
  LOCKOUT_WINDOW_MIN: '15',
  SESSION_STATE_TTL_MS: '30000',
  DB_QUERY_TIMEOUT_MS: '2000',
  PORT: '3000',
  NODE_ENV: 'test',
  EVIDENCE_ENC_KEY: 'd'.repeat(40),
};

describe('026 · validador compartido de EVIDENCE_ENC_KEY (FR-013)', () => {
  it('EVIDENCE_ENC_KEY_MIN_LENGTH === 32 (misma regla que config.ts hoy)', () => {
    expect(EVIDENCE_ENC_KEY_MIN_LENGTH).toBe(32);
  });

  it('rechaza ausente/undefined/no-string', () => {
    expect(isValidEvidenceEncKey(undefined)).toBe(false);
    expect(isValidEvidenceEncKey(null)).toBe(false);
    expect(isValidEvidenceEncKey(12345)).toBe(false);
  });

  it('rechaza <32 caracteres; acepta ===32 y >32', () => {
    expect(isValidEvidenceEncKey('x'.repeat(31))).toBe(false);
    expect(isValidEvidenceEncKey('x'.repeat(32))).toBe(true);
    expect(isValidEvidenceEncKey('x'.repeat(40))).toBe(true);
  });

  it('config.ts importa el MISMO módulo compartido (no una copia de la regla)', () => {
    const src = readFileSync('src/infra/config.ts', 'utf8');
    expect(src).toMatch(/from ['"]\.\/evidence-enc-key['"]/);
  });

  it('el seed importa el MISMO módulo compartido que config.ts (una sola fuente de verdad)', () => {
    const src = readFileSync('prisma/seed.ts', 'utf8');
    expect(src).toMatch(/from ['"](\.\.\/src\/infra\/evidence-enc-key|\.\/evidence-enc-key)['"]/);
  });

  it('loadConfig() SIGUE rechazando EVIDENCE_ENC_KEY ausente tras el refactor (no debilita producción)', () => {
    const withoutKey: Record<string, string> = { ...base };
    delete withoutKey.EVIDENCE_ENC_KEY;
    expect(() => loadConfig(withoutKey)).toThrowError(/EVIDENCE_ENC_KEY/);
  });

  it('loadConfig() SIGUE rechazando EVIDENCE_ENC_KEY <32 caracteres tras el refactor', () => {
    expect(() => loadConfig({ ...base, EVIDENCE_ENC_KEY: 'x'.repeat(31) })).toThrowError(/EVIDENCE_ENC_KEY/);
  });

  it('loadConfig() acepta EVIDENCE_ENC_KEY válida (≥32) tras el refactor', () => {
    expect(() => loadConfig(base)).not.toThrow();
  });
});
